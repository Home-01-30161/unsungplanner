/**
 * Server-only security helpers: client IP extraction, log scrubbing, URL
 * validation and optional Cloudflare Turnstile verification.
 *
 * Never import this from a client component — it reads server env vars.
 */

/** Best-effort client IP. Cloudflare sets `cf-connecting-ip`; Vercel sets `x-vercel-forwarded-for`; standard proxies set `x-real-ip` or `x-forwarded-for`. */
export function clientIp(req: Request): string {
    const cf = req.headers.get("cf-connecting-ip");
    if (cf?.trim()) return cf.trim();

    const vercel = req.headers.get("x-vercel-forwarded-for");
    if (vercel?.trim()) return vercel.split(",")[0].trim();

    const realIp = req.headers.get("x-real-ip");
    if (realIp?.trim()) return realIp.trim();

    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded?.trim()) return forwarded.split(",")[0].trim();

    return "unknown";
}

/** Removes API keys / bearer tokens from anything that is about to be logged. */
export function scrubSecrets(input: unknown): string {
    const text = input instanceof Error ? `${input.name}: ${input.message}` : String(input);
    return text
        .replace(/(api_key|apikey|apiKey|token|key)=([^&\s"'`]+)/gi, "$1=***")
        .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1***")
        .slice(0, 2_000);
}

/** True only for absolute http(s) URLs — used before rendering untrusted research links. */
export function isHttpUrl(value: unknown): value is string {
    if (typeof value !== "string" || value.length > 2_048) return false;
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

/**
 * Verifies a Cloudflare Turnstile token when TURNSTILE_SECRET_KEY is configured.
 * Returns true unconditionally when the secret is absent, so local dev and
 * self-hosted setups keep working without captcha.
 *
 * The token is single-use; the client must obtain a fresh one for each attempt.
 */
export async function verifyTurnstile(tokenValue: unknown, ip: string): Promise<boolean> {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) return true;

    const token = typeof tokenValue === "string" ? tokenValue : "";
    if (!token || token.length > 4_096) return false;

    try {
        const params: Record<string, string> = { secret, response: token };
        if (ip && ip !== "unknown") {
            params.remoteip = ip;
        }
        const body = new URLSearchParams(params);
        const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            body,
            signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { success?: boolean };
        return data.success === true;
    } catch {
        // Fail closed: if Cloudflare is unreachable we do not hand out free quota.
        return false;
    }
}
