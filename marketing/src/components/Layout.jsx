import { Link, NavLink } from 'react-router-dom';

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/features', label: 'Features' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/faq', label: 'FAQ' },
];

export default function Layout({ children }) {
  const year = new Date().getFullYear();

  return (
    <div className="site">
      <header className="site-header">
        <div className="container site-header-inner">
          <Link to="/" className="brand">
            VisualKit
          </Link>
          <nav className="site-nav" aria-label="Main navigation">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) => (isActive ? 'site-nav-link active' : 'site-nav-link')}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <a href="#" className="button install-cta">
            Install on Shopify
          </a>
        </div>
      </header>

      <main>{children}</main>

      <footer className="site-footer">
        <div className="container site-footer-inner">
          <div className="footer-brand">
            <span className="brand">VisualKit</span>
            <p className="text-muted">AI product photography, UGC content, and video for Shopify catalogs.</p>
          </div>
          <nav className="footer-links" aria-label="Footer navigation">
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
            <Link to="/blog">Blog</Link>
          </nav>
          <p className="text-muted footer-copyright">&copy; {year} VisualKit. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
