import { useState } from 'react';
import './Login.css'
import { Link, useNavigate } from "react-router-dom";
import { GithubAuthProvider,browserLocalPersistence, browserSessionPersistence, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { auth, githubProvider, googleProvider } from './firebase';

function getErrorMessage(code) {
    switch (code) {
        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found":
            return "Incorrect email or password.";
        case "auth/invalid-email":
            return "Please enter a valid email.";
        case "auth/too-many-requests":
            return "Too many attempts. Try again later.";
        case "auth/popup-closed-by-user":
            return "Sign-in popup was closed.";
        case "auth/account-exists-with-different-credential":
            return "An account already exists with this email using a different sign-in method.";
        default:
            return "Something went wrong. Please try again.";
    }
}

function Login() {

    const [form, setForm] = useState({
        email: "",
        password: "",
    });

    const [remember, setRemember] = useState(true);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const navigate = useNavigate();

    const handleChange = (e) => {
        setForm({
            ...form,
            [e.target.name]: e.target.value,
        });
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError("");
        setMessage("");
        setLoading(true);
        try {
            await setPersistence(
                auth,
                remember ? browserLocalPersistence : browserSessionPersistence
            );
            await signInWithEmailAndPassword(auth, form.email, form.password);
            setSuccess(true);
            setTimeout(() => navigate("/Home"), 2000);
        } catch (err) {
            setError(getErrorMessage(err.code));
        } finally {
            setLoading(false);
        }
    }

    const handleSocialLogin = async (provider) => {
        setError("");
        setMessage("");
        try {
            const result = await signInWithPopup(auth, provider);   // <-- capture result

            if (provider.providerId === "github.com") {
                const credential = GithubAuthProvider.credentialFromResult(result);
                const token = credential?.accessToken;
                if (token) {
                    localStorage.setItem("githubToken", token);     // or your own saveGithubToken(token)
                }
            }

            setSuccess(true);
            setTimeout(() => navigate("/Home"), 2000);
        } catch (err) {
            console.error(err);                                      // helps debugging
            setError(getErrorMessage(err.code));
        }
    };

    const handleForgetPassword = async () => {
        setMessage("");
        if (!form.email) {
            setError("Enter your email first,then click Forget Password.");
            return;
        }
        try {
            await sendPasswordResetEmail(auth, form.email);
            setError("");
            setMessage("Password reset email sent. Check your inbox.");
        } catch (err) {
            setError(getErrorMessage(err.code));
        }
    };

    return (
        <div>
            <div className='login-container'>
                <div className='info'>
                    <h3>Cortex Hub</h3>
                    <div className='inside'>
                        <h1>Your AI workspace, all in one place.</h1>
                        <p>Chat with AI, save prompts, manage tasks, take notes and track progress without switching tools.</p>
                        <div className='lst'>
                            <p>✔ AI Chat & Prompt Library</p>
                            <p>✔ Kanban task board</p>
                            <p>✔ Notes & File Manager</p>
                            <p>✔ Productivity dashboard</p>
                        </div>
                    </div>
                    <p className='c'>© 2026 Cortex Hub</p>
                </div>
                <div className='login'>
                    {success ? (
                        <div className='success-box'>
                            <div className='tick'>✓</div>
                            <h2>You're signed in</h2>
                            <p>Redirecting to your dashboard…</p>
                            <Link to="/Login">Back to login</Link>
                        </div>
                    ) : (
                        <>
                            <h2 >Log in</h2>
                            <p>Welcome back! Enter your details.</p>
                            <div className='buttons'>
                                <button className='google' onClick={() => handleSocialLogin(googleProvider)}>Continue with Google</button>
                                <button className='git' onClick={() => handleSocialLogin(githubProvider)}>Continue with Git</button>
                                <p className='or'>or</p>
                            </div>
                            <form className='form' onSubmit={handleLogin}>
                                <div>
                                    <label>Email</label>
                                    <input type="email" placeholder="you@example.com" required name='email' value={form.email} onChange={handleChange}></input>
                                </div>
                                <div>
                                    <label>Password</label>
                                    <input type="password" placeholder="••••••••" name="password" required value={form.password} onChange={handleChange}></input>
                                </div>
                                <div className='pass'>
                                    <div className='rem'>
                                        <input type='checkbox' checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                                        <p>Remember Me</p>
                                    </div>
                                    <p onClick={handleForgetPassword} style={{ cursor: "pointer" }}>Forgot Password?</p>
                                </div>

                                {error && <p style={{ color: "red" }}>{error}</p>}
                                {message && <p style={{ color: "green" }}>{message}</p>}

                                <button className='loginbt' type="submit" disabled={loading}>
                                    {loading ? "Logging in..." : "Login"}
                                </button>

                            </form>
                            <p>Don’t have an account? <Link to="/Signup" className='sig'>Signup</Link></p>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

export default Login