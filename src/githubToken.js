import { GithubAuthProvider } from 'firebase/auth'

export function saveGithubToken(result) {
    const credential = GithubAuthProvider.credentialFromResult(result)
    if (credential?.accessToken) {
        sessionStorage.setItem('gh_token', credential.accessToken)
    }
}