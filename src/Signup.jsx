import { useState } from 'react';
import './Signup.css'
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, signInWithPopup, updateProfile } from 'firebase/auth';
import { auth, githubProvider, googleProvider } from './firebase';


function getErrorMessage(code) {
    switch (code) {
        case "auth/email-already-in-use":
            return "An account with this email already exists.";
        case "auth/weak-password":
            return "Password must be at least 6 characters.";
        case "auth/invalid-email":
            return "Please enter a valid email.";
        case "auth/popup-closed-by-user":
            return "Sign-in popup was closed.";
        case "auth/account-exists-with-different-credential":
            return "An account already exists with this email using a different sign-in method.";
        default:
            return "Something went wrong. Please try again.";
    }
}
function Signup() {

    const [form, setForm] = useState({
        fullname: "",
        email: "",
        password: "",
    });
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [welcomeName, setWelcomeName] = useState("");
    const navigate = useNavigate();

    const handleChange = (e) => {
        setForm({
            ...form,
            [e.target.name]: e.target.value,
        });
    };

    const handleSignup = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
            await updateProfile(cred.user, { displayName: form.fullname });
            setWelcomeName(form.fullname.split(" ")[0]);
            setSuccess(true);
            setTimeout(() => navigate("/Home"), 2000);
        } catch (err) {
            setError(getErrorMessage(err.code));
        } finally {
            setLoading(false);
        }
    };

    const handleSocialSignup = async (provider) => {
        setError("");
        try {
            const result = await signInWithPopup(auth, provider);   // <-- capture result
            const name = result.user.displayName || "";
            setWelcomeName(name.split(" ")[0]);
            setSuccess(true);
            setTimeout(() => navigate("/Home"), 2000);
        } catch (err) {
            console.error(err);
            setError(getErrorMessage(err.code));
        }
    };

    return (
        <div className='signup-container'>
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
            <div className='signup'>
                {success ? (
                    <div className='success-box'>
                        <div className='tick'>✓</div>
                        <h2>Welcome{welcomeName && `, ${welcomeName}`}!</h2>
                        <p>Redirecting to your dashboard…</p>
                        <Link to="/Login">Back to login</Link>
                    </div>
                ) : (
                    <>
                        <h2>Create an account</h2>
                        <p>Start your free workspace today</p>
                        <div className='buttons'>
                            <button className='google' onClick={() => handleSocialSignup(googleProvider)}>Continue with Google</button>
                            <button className='git' onClick={() => handleSocialSignup(githubProvider)}>Continue with Git</button>
                            <p className='or'>or</p>
                        </div>
                        <form className='form' onSubmit={handleSignup}>
                            <div>
                                <label>Full Name</label>
                                <input type="text" placeholder="Jane Doe" name="fullname" required value={form.fullname} onChange={handleChange}></input>
                            </div>
                            <div>
                                <label>Email</label>
                                <input type="email" placeholder="you@example.com" name="email" required value={form.email} onChange={handleChange}></input>
                            </div>
                            <div>
                                <label>Password</label>
                                <input type="password" placeholder="••••••••" name="password" required value={form.password} onChange={handleChange} minLength={8}></input>
                            </div>
                            {error && <p style={{ color: "red" }}>{error}</p>}
                            <button className='signupbt' type="submit" disabled={loading}>
                                {loading ? "Creating account..." : "Sign Up"}
                            </button>
                        </form>
                        <p>Already have an account? <Link to="/Login">Log in</Link></p>

                    </>
                )}

            </div>
        </div>
    )
}

export default Signup