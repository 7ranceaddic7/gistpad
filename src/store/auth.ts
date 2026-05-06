import {
  authentication,
  AuthenticationSession,
  commands,
  window
} from "vscode";
import { store } from ".";
import { EXTENSION_NAME } from "../constants";
import { refreshGists } from "./actions";
const GitHub = require("github-base");

let loginSession: string | undefined;

export function getCurrentUser() {
  return store.login;
}

const STATE_CONTEXT_KEY = `${EXTENSION_NAME}:state`;
const STATE_SIGNED_IN = "SignedIn";
const STATE_SIGNED_OUT = "SignedOut";

const GIST_SCOPE = "gist";
const REPO_SCOPE = "repo";
const DELETE_REPO_SCOPE = "delete_repo";

// TODO: Replace github-base with octokit
export async function getApi(newToken?: string) {
  const token = newToken || (await getToken());
  return new GitHub({ token });
}

const TOKEN_RESPONSE = "Sign in";
export async function ensureAuthenticated() {
  if (store.isSignedIn) {
    return;
  }

  const response = await window.showErrorMessage(
    "You need to sign-in with GitHub to perform this operation.",
    TOKEN_RESPONSE
  );
  if (response === TOKEN_RESPONSE) {
    await signIn();
  }
}

async function getSession(
  isInteractiveSignIn: boolean = false,
  includeDeleteRepoScope: boolean = false
) {
  const scopes = [GIST_SCOPE, REPO_SCOPE];
  if (includeDeleteRepoScope) {
    scopes.push(DELETE_REPO_SCOPE);
  }

  try {
    if (isInteractiveSignIn) {
      isSigningIn = true;
    }

    const session = await authentication.getSession("github", scopes, {
      createIfNone: isInteractiveSignIn
    });

    if (session) {
      loginSession = session?.id;
    }

    isSigningIn = false;

    return session;
  } catch { }
}

export async function getToken() {
  return store.token;
}

async function markUserAsSignedIn(
  session: AuthenticationSession,
  refreshUI: boolean = true
) {
  loginSession = session.id;

  store.token = session.accessToken;
  store.isSignedIn = true;
  store.login = session.account.label;
  store.canCreateRepos = session.scopes.includes(REPO_SCOPE);
  store.canDeleteRepos = session.scopes.includes(DELETE_REPO_SCOPE);

  if (refreshUI) {
    commands.executeCommand("setContext", STATE_CONTEXT_KEY, STATE_SIGNED_IN);
    await refreshGists();
  }
}

function markUserAsSignedOut() {
  loginSession = undefined;

  store.login = "";
  store.isSignedIn = false;

  commands.executeCommand("setContext", STATE_CONTEXT_KEY, STATE_SIGNED_OUT);
}

let isSigningIn = false;
export async function signIn() {
  const session = await getSession(true);

  if (session) {
    window.showInformationMessage(
      "You're successfully signed in and can now manage your GitHub gists and repositories!"
    );
    await markUserAsSignedIn(session);
    return true;
  }
}

export async function elevateSignin() {
  const session = await getSession(true, true);

  if (session) {
    await markUserAsSignedIn(session, false);
    return true;
  }
}

async function attemptSilentSignin(refreshUI: boolean = true) {
  const session = await getSession();

  if (session) {
    await markUserAsSignedIn(session, refreshUI);
  } else {
    await markUserAsSignedOut();
  }
}

export async function initializeAuth() {
  authentication.onDidChangeSessions(async (e) => {
    if (e.provider.id === "github") {
      if (isSigningIn) {
        isSigningIn = false;
        return;
      }

      await attemptSilentSignin();
    }
  });

  await attemptSilentSignin();
}
