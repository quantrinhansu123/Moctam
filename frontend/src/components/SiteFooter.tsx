import type { MouseEvent } from "react";
import type { NavKey } from "../data/navigation";
import { useSiteSettings } from "../lib/siteSettings";

interface SiteFooterProps {
  onNavigate: (key: NavKey) => void;
  onProduct: (id: string) => void;
}

export function SiteFooter({ onNavigate, onProduct }: SiteFooterProps) {
  const { settings } = useSiteSettings();
  const footer = settings.footer as {
    logo?: string; brand?: string; description?: string; badges?: string[];
    quickLinks?: { label: string; target?: NavKey; productId?: string }[];
    careLinks?: { label: string; target?: NavKey; productId?: string }[];
    taxId?: string; address?: string; hours?: string; copyright?: string;
  };
  const go =
    (key: NavKey) =>
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      onNavigate(key);
    };
  const goProduct =
    (id: string) =>
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      onProduct(id);
    };

  return (
    <footer id="footer" className="site-footer">
      <div className="footer-container">
        <div className="footer-grid">
          {/* Column 1: Brand & Story */}
          <div className="footer-col footer-col-brand">
            <a
              className="footer-brand"
              href="#"
              aria-label="Mộc Tâm"
              onClick={go("shop")}
            >
              <img
                src={footer.logo || ""}
                alt={footer.brand || "Mộc Tâm"}
                className="footer-logo"
              />
              <span className="footer-brand-title">{footer.brand}</span>
            </a>
            <p className="footer-desc">
              {footer.description}
            </p>
            <div className="footer-badges">
              <span className="footer-badge">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"></path>
                  <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"></path>
                </svg>
                {footer.badges?.[0]}
              </span>
              <span className="footer-badge">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
                {footer.badges?.[1]}
              </span>
            </div>
          </div>

          {/* Column 2: Quick Links */}
          <div className="footer-col">
            <h3 className="footer-heading">Quick Links</h3>
            <ul className="footer-links">
              {footer.quickLinks?.map((link, index) => <li key={`${link.label}-${index}`}><a href="#" onClick={link.productId ? goProduct(link.productId) : go(link.target || "shop")}>{link.label}</a></li>)}
            </ul>
          </div>

          {/* Column 3: Customer Care & Policies */}
          <div className="footer-col">
            <h3 className="footer-heading">Customer Care</h3>
            <ul className="footer-links">
              {footer.careLinks?.map((link, index) => <li key={`${link.label}-${index}`}><a href="#" onClick={link.productId ? goProduct(link.productId) : go(link.target || "contact")}>{link.label}</a></li>)}
            </ul>
          </div>

          {/* Column 4: Contact Information */}
          <div className="footer-col footer-col-contact">
            <h3 className="footer-heading">Contact Us</h3>
            <div className="footer-contact-items">
              <div className="footer-contact-item">
                <span className="contact-icon" aria-hidden="true">
                  <span className="material-icon material-symbols-outlined">badge</span>
                </span>
                <div className="contact-text">
                  <p aria-label="Tax identification number">{footer.taxId}</p>
                </div>
              </div>
              <div className="footer-contact-item">
                <span className="contact-icon" aria-hidden="true">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                </span>
                <div className="contact-text">
                  <p aria-label="Business address">{footer.address}</p>
                </div>
              </div>
              <div className="footer-contact-item">
                <span className="contact-icon" aria-hidden="true">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                </span>
                <div className="contact-text">
                  <p aria-label="Opening hours">{footer.hours}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="footer-bottom">
        <div className="footer-container">
          <div className="footer-bottom-inner">
            <p className="footer-copyright">{footer.copyright}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
