import './landing.css'
import { Links, useNavigate } from "react-router";
import { Link } from "react-router";

function Landing_Page(){

    const navigate=useNavigate();

    return(
        <nav className='nav'>
            <div>
                <h2>Cortex Hub</h2>
            </div>
            <div>
                <Link to="/Login" className='link'>Login</Link>
            </div>
        </nav>
    )
}
export default Landing_Page