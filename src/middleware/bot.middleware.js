/**
 * bot.middleware.js  Ultimate CAD – Bot-Only Auth Middleware
 *
 * Protects /bot-api/* endpoints from public access. The Discord bot
 * sends a shared secret in the `x-bot-secret` header, matching the
 * DISCORD_BOT_SECRET env variable in both the main app and the bot's .env.
 *
 * Usage:
 *   import { verifyBotSecret } from './bot.middleware.js';
 *   router.use(verifyBotSecret);
 */

export function verifyBotSecret(req, res, next) {
  const secret = req.headers['x-bot-secret'];
  if (!secret || secret !== process.env.DISCORD_BOT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized: invalid bot secret' });
  }
  next();
}
