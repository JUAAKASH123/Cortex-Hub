import './App.css'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Landing_Page from './landing_page'
import Signup from './Signup' 
import Login from './Login'
import Home from './Home'
import Navbar from './navbar'
import Ai from './Ai'
import ProtectedRoute from './ProtectedRoute'
import Note from './Note'
import Prompt from './prompt'
import Task from './task_manager'
import FileManager from './file_Manager'
import RootRoute from './RootRoute'

function App() {


  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<RootRoute />} />
        <Route path='/Landing_Page' element={<Landing_Page/>}/>
        <Route path='/Signup' element={<Signup/>}/>
        <Route path='/Login' element={<Login/>}/>

        <Route path='/Navbar' element={<ProtectedRoute><Navbar/></ProtectedRoute>}/>
        <Route path='/Home' element={<ProtectedRoute><Home/></ProtectedRoute>}/>
        <Route path='/Ai' element={<ProtectedRoute><Ai/></ProtectedRoute>}/>
        <Route path='/Note' element={<ProtectedRoute><Note/></ProtectedRoute>}/>
        <Route path='/Prompt' element={<ProtectedRoute><Prompt/></ProtectedRoute>}/>
        <Route path='/Task' element={<ProtectedRoute><Task/></ProtectedRoute>}/>
        <Route path='/FileManager' element={<ProtectedRoute><FileManager/></ProtectedRoute>}/>
      </Routes>
    </BrowserRouter>
  )
}

export default App
