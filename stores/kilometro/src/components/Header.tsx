import { Mark } from "@/brand/Mark";
import { cartCount } from "@/lib/cart";

export async function Header() {
  const count = await cartCount();
  return (
    <header className="site-header">
      <div className="wrap header-row">
        <a href="/" className="brand" aria-label="Kilómetro, inicio">
          <Mark size={30} />
          <span>Kilómetro</span>
        </a>
        <form action="/" method="get" role="search" className="search">
          <label htmlFor="q" className="sr-only">
            Buscar tenis
          </label>
          <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
            <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input id="q" name="q" type="search" placeholder="Buscar" autoComplete="off" />
        </form>
        <nav aria-label="Principal" className="main-nav">
          <a href="/trail">Trail</a>
          <a href="/ruta">Ruta</a>
          <a href="/envios">Envíos</a>
          <a href="/carrito" className="cart-link">
            Carrito{count > 0 && <span className="count" aria-label={`${count} artículos`}>{count}</span>}
          </a>
        </nav>
      </div>
    </header>
  );
}
