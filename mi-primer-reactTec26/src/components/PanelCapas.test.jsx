import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PanelCapas from './PanelCapas.jsx'

describe('PanelCapas', () => {
  it('muestra cada capa marcada o no según su estado', () => {
    render(<PanelCapas capas={{ sismos: true, ciclones: true, satelite: false }} alCambiar={() => {}} />)

    expect(screen.getByRole('checkbox', { name: 'Sismos' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Ciclones' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Satélite' })).not.toBeChecked()
  })

  it('marcar Satélite llama alCambiar("satelite", true)', () => {
    const alCambiar = vi.fn()
    render(<PanelCapas capas={{ sismos: true, ciclones: true, satelite: false }} alCambiar={alCambiar} />)

    screen.getByRole('checkbox', { name: 'Satélite' }).click()
    expect(alCambiar).toHaveBeenCalledWith('satelite', true)
  })

  it('desmarcar Sismos llama alCambiar("sismos", false)', () => {
    const alCambiar = vi.fn()
    render(<PanelCapas capas={{ sismos: true, ciclones: true, satelite: false }} alCambiar={alCambiar} />)

    screen.getByRole('checkbox', { name: 'Sismos' }).click()
    expect(alCambiar).toHaveBeenCalledWith('sismos', false)
  })
})

describe('PanelCapas: refugios y bloqueos', () => {
  it('incluye Refugios y Bloqueos', () => {
    const alCambiar = vi.fn()
    render(
      <PanelCapas
        capas={{ sismos: true, ciclones: true, satelite: false, refugios: true, bloqueos: true }}
        alCambiar={alCambiar}
      />,
    )

    expect(screen.getByRole('checkbox', { name: 'Refugios' })).toBeChecked()
    screen.getByRole('checkbox', { name: 'Bloqueos' }).click()
    expect(alCambiar).toHaveBeenCalledWith('bloqueos', false)
  })
})

describe('PanelCapas: incidentes (etapa 6)', () => {
  it('solo muestra Incidentes si la página lo pide', () => {
    const capas = { sismos: true, ciclones: true, satelite: false, refugios: true, bloqueos: true, incidentes: true }
    const { unmount } = render(<PanelCapas capas={capas} alCambiar={() => {}} />)
    expect(screen.queryByRole('checkbox', { name: 'Incidentes' })).toBeNull()
    unmount()

    render(<PanelCapas capas={capas} alCambiar={() => {}} extras={['incidentes']} />)
    expect(screen.getByRole('checkbox', { name: 'Incidentes' })).toBeChecked()
  })
})
