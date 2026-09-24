import { useSiteSettings } from "../lib/siteSettings";

export function AnnouncementBar() {
  const { settings } = useSiteSettings();
  const items = settings.announcementBar.filter((item) => item.enabled !== false);
  if (!items.length) return null;
  return (
    <div className="announcement has-delivery" aria-label="Store announcements">
      <div className="announcement-track">
        {items.map((item, index) => (
          <p key={`${item.text}-${index}`}>
            <span
              className="announcement-icon material-icon material-symbols-outlined"
              aria-hidden="true"
            >
              {item.glyph}
            </span>
            {item.text}
          </p>
        ))}
      </div>
    </div>
  );
}
