import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import BotonInstalarApp from './BotonInstalarApp.jsx'

function eventoInstalacion() {
  const evento = new Event('beforeinstallprompt', { cancelable: true })
  evento.prompt = vi.fn()
  evento.userChoice = Promise.resolve({ outcome: 'accepted' })
  return evento
}

describe('BotonInstalarApp', () => {
  it('muestra cómo instalar aunque el navegador todavía no abra el diálogo', () => {
    render(<BotonInstalarApp />)
    fireEvent.click(screen.getByRole('button', { name: 'Instalar app' }))
    expect(screen.getByText('Abre el menú del navegador y elige “Instalar Alerta México”.')).toBeInTheDocument()
  })

  it('abre el diálogo de instalación y se oculta al terminar', async () => {
    render(<BotonInstalarApp />)
    const evento = eventoInstalacion()

    fireEvent(window, evento)
    fireEvent.click(screen.getByRole('button', { name: 'Instalar app' }))

    expect(evento.defaultPrevented).toBe(true)
    expect(evento.prompt).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Instalar app' })).toBeNull())
  })

  it('se oculta si la instalación termina en otra pantalla', () => {
    render(<BotonInstalarApp />)
    fireEvent(window, eventoInstalacion())
    expect(screen.getByRole('button', { name: 'Instalar app' })).toBeInTheDocument()

    fireEvent(window, new Event('appinstalled'))
    expect(screen.queryByRole('button', { name: 'Instalar app' })).toBeNull()
  })
})
