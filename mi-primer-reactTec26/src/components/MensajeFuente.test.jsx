import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import MensajeFuente from './MensajeFuente.jsx'

const SISMOS = { etiqueta: 'los sismos', plural: true }
const SATELITE = { etiqueta: 'la imagen de satélite', plural: false }

function mostrar(props) {
  return render(<MensajeFuente hora="16 oct 2026, 15:46" recargar={vi.fn()} {...props} />)
}

describe('MensajeFuente', () => {
  it('no muestra nada si todo está bien', () => {
    const { container } = mostrar({ ...SISMOS, estado: 'listo', error: null, hayDatos: true })
    expect(container).toBeEmptyDOMElement()
  })

  it('cargando sin datos', () => {
    mostrar({ ...SISMOS, estado: 'cargando', error: null, hayDatos: false })
    expect(screen.getByText('Cargando los sismos…')).toBeInTheDocument()
  })

  it('cargando con datos dice Actualizando', () => {
    mostrar({ ...SISMOS, estado: 'cargando', error: null, hayDatos: true })
    expect(screen.getByText('Actualizando los sismos…')).toBeInTheDocument()
  })

  it('error sin datos en plural', () => {
    mostrar({ ...SISMOS, estado: 'error', error: 'USGS respondió 503', hayDatos: false })
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los sismos: USGS respondió 503')
  })

  it('error sin datos en singular', () => {
    mostrar({ ...SATELITE, estado: 'error', error: 'No se pudo conectar con NASA GIBS', hayDatos: false })
    expect(
      screen.getByText('No se pudo cargar la imagen de satélite: No se pudo conectar con NASA GIBS'),
    ).toBeInTheDocument()
  })

  it('error con datos dice desde cuándo son los datos', () => {
    mostrar({ ...SISMOS, estado: 'error', error: 'USGS respondió 500', hayDatos: true })
    expect(
      screen.getByText('No se pudieron actualizar los sismos. Mostrando datos del 16 oct 2026, 15:46.'),
    ).toBeInTheDocument()
  })

  it('Reintentar llama recargar', () => {
    const recargar = vi.fn()
    render(
      <MensajeFuente {...SISMOS} estado="error" error="USGS respondió 503" hayDatos={false} hora="—" recargar={recargar} />,
    )
    screen.getByRole('button', { name: 'Reintentar' }).click()
    expect(recargar).toHaveBeenCalledTimes(1)
  })

  it('sin error no hay botón Reintentar', () => {
    mostrar({ ...SISMOS, estado: 'cargando', error: null, hayDatos: false })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
