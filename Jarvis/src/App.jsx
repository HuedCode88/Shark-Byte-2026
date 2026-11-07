import { useState } from 'react'
import heroImg from './assets/hero.png'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import Jarvis from "./components/Jarvis";
import './App.css'

export default function App() {
  return (
    <div>
      <h1>My Jarvis Bot</h1>
      <Jarvis />
    </div>
  );
}