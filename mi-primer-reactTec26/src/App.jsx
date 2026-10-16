import { useState } from 'react'
import heroImg from './assets/hero.png'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (  
  <main>
    <h1>Mi primer proyecto de React</h1>

    <p>
      Esta interfaz fue creada utilizando un componenete jeje ¿como le hago para sacar 100
    </p>

    <button>Comenzar</button>
  </main>
  )
}

export default App
