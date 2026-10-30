const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function withoutWww(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Affiliate links must stay on the program's own site. Without this check `/r/{code}` would
 * be an open redirect anyone could use with the program's domain in the link.
 */
export function destinationProblem(destinationUrl: string, websiteUrl: string): string | null {
  const destination = parseHttpUrl(destinationUrl);
  const website = parseHttpUrl(websiteUrl);
  if (!destination) return "Enter a valid http or https URL.";
  if (!website) return "The program website is not configured. Ask an admin to fix it in settings.";
  if (destination.username || destination.password) return "Remove the username or password from the URL.";

  const siteHost = withoutWww(website.hostname);
  const destinationHost = withoutWww(destination.hostname);
  const local = LOCAL_HOSTS.has(siteHost);
  if (destination.protocol !== "https:" && !(local && LOCAL_HOSTS.has(destinationHost))) {
    return "Use an https:// address.";
  }
  if (siteHost !== destinationHost && !destinationHost.endsWith(`.${siteHost}`)) {
    return `The destination must be on ${website.hostname} or one of its subdomains.`;
  }
  return null;
}

export function isHttpUrl(value: string): boolean {
  return parseHttpUrl(value) !== null;
}

/** Allows the tracking script to call the click endpoint from the program's own site only. */
export function isAllowedSiteOrigin(origin: string, websiteUrl: string): boolean {
  const candidate = parseHttpUrl(origin);
  const website = parseHttpUrl(websiteUrl);
  if (!candidate || !website) return false;
  const siteHost = withoutWww(website.hostname);
  const originHost = withoutWww(candidate.hostname);
  return originHost === siteHost || originHost.endsWith(`.${siteHost}`);
}
