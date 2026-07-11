/**
 * deploy-commands.js  Ultimate CAD Bot – Slash Command Registration
 *
 * Run this script ONCE to register or update slash commands with Discord.
 *
 * Usage:
 *   node deploy-commands.js
 *
 * ── Guild vs Global commands ──────────────────────────────────────
 * Guild commands (DISCORD_GUILD_ID) update instantly — great for testing.
 * Global commands take up to an hour to propagate.
 *
 * When you're ready for production, remove DISCORD_GUILD_ID from .env
 * and change Routes.applicationGuildCommands → Routes.applicationCommands.
 */

import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

/* ── Define slash commands ───────────────────────────────────── */

const commands = [
  new SlashCommandBuilder()
    .setName('link')
    .setDescription('Check your Ultimate CAD account link status'),

  new SlashCommandBuilder()
    .setName('units')
    .setDescription('Show currently active CAD units on this server'),

  new SlashCommandBuilder()
    .setName('dept-role-sync')
    .setDescription('Preview department members and ranks for role mapping'),

  new SlashCommandBuilder()
    .setName('server-link')
    .setDescription('Check if this Discord server is linked to an Ultimate CAD server'),

  new SlashCommandBuilder()
    .setName('members')
    .setDescription('List all members of the linked Ultimate CAD server'),
];

/* ── Register with Discord ───────────────────────────────────── */

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

const clientId = process.env.DISCORD_CLIENT_ID;
const guildId  = process.env.DISCORD_GUILD_ID;

if (!clientId) {
  console.error('❌ DISCORD_CLIENT_ID is not set in .env');
  process.exit(1);
}

if (!process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN === 'your_bot_token_here') {
  console.error('❌ DISCORD_BOT_TOKEN is not set or still has the placeholder value.');
  console.log('');
  console.log('  1. Go to https://discord.com/developers/applications');
  console.log('  2. Select your application → Bot → Reset Token / Copy token');
  console.log('  3. Paste it into discord-bot/.env as DISCORD_BOT_TOKEN');
  process.exit(1);
}

const route = guildId
  ? Routes.applicationGuildCommands(clientId, guildId)
  : Routes.applicationCommands(clientId);

console.log('');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  Slash Command Registration                                  ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');

console.log(`📋 Registering ${commands.length} slash command(s)…`);
console.log(`   Mode: ${guildId ? 'Guild (instant)' : 'Global (up to 1 hour to propagate)'}`);

if (!guildId) {
  console.log('');
  console.log('   ⏳ Global commands can take up to an hour to appear.');
  console.log('   For instant testing, set DISCORD_GUILD_ID in .env');
  console.log('   to your Discord server ID, then re-run this script.');
}

console.log('');

try {
  const data = await rest.put(route, { body: commands.map((c) => c.toJSON()) });

  console.log(`✅ Successfully registered ${data.length} command(s):`);
  data.forEach((cmd) => console.log(`   /${cmd.name} — ${cmd.description}`));
  console.log('');

  /* ── Print invite URL ────────────────────────────────────── */
  const permissions = PermissionFlagsBits.SendMessages
                   | PermissionFlagsBits.EmbedLinks
                   | PermissionFlagsBits.ReadMessageHistory
                   | PermissionFlagsBits.UseExternalEmojis;

  const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&integration_type=0&scope=bot+applications.commands`;

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  IMPORTANT: Invite your bot with the RIGHT URL              ║');
  console.log('║                                                              ║');
  console.log('║  You need BOTH scopes for slash commands to work:           ║');
  console.log('║    • bot                     (for the bot to be in server)  ║');
  console.log('║    • applications.commands   (for slash commands)            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('🔗 Invite URL (click this):');
  console.log(`   ${inviteUrl}`);
  console.log('');
} catch (err) {
  console.error('❌ Failed to register commands:', err.message);
  console.log('');
  console.log('Common causes:');
  console.log('  • DISCORD_BOT_TOKEN is wrong or expired');
  console.log('  • DISCORD_CLIENT_ID does not match the bot application');
  console.log('  • DISCORD_GUILD_ID is set to a server the bot is not in');
  process.exit(1);
}
