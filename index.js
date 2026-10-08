require("dotenv").config();

const { Client, GatewayIntentBits, Events, ChannelType, ActivityType } = require("discord.js");
const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require("@discordjs/voice");

const GUILD_ID = process.env.GUILD_ID;
const DEFAULT_CHANNEL_ID = "1557587230531256390";

// Streaming status (purple). The URL must be a real Twitch or YouTube link, or Discord shows normal "Playing".
const STREAM_TEXT = process.env.STREAM_TEXT || "24/7 in voice";
const STREAM_URL = process.env.STREAM_URL || "https://www.twitch.tv/discord";

// 3 bots: each has its own token. Channel defaults to the one above,
// or set VOICE_CHANNEL_ID_1 / _2 / _3 in the variables to give a bot its own channel.
const BOTS = [
  { name: "Bot 1", token: process.env.TOKEN_1, channelId: process.env.VOICE_CHANNEL_ID_1 || DEFAULT_CHANNEL_ID },
  { name: "Bot 2", token: process.env.TOKEN_2, channelId: process.env.VOICE_CHANNEL_ID_2 || DEFAULT_CHANNEL_ID },
  { name: "Bot 3", token: process.env.TOKEN_3, channelId: process.env.VOICE_CHANNEL_ID_3 || DEFAULT_CHANNEL_ID }
];

function startBot({ name, token, channelId }) {
  if (!token) {
    console.error(`[${name}] Missing token, skipping.`);
    return;
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
  });

  let reconnectTimer = null;

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectToVC();
    }, 5000);
  }

  async function connectToVC() {
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const channel = await guild.channels.fetch(channelId);

      if (!channel || channel.type !== ChannelType.GuildVoice) {
        console.error(`[${name}] Voice channel not found or the ID is not a voice channel.`);
        return;
      }

      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        group: name, // required so 3 bots in the same server don't clash in one process
        selfDeaf: true,
        selfMute: true
      });

      console.log(`[${name}] Joined VC: ${channel.name}`);

      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        console.log(`[${name}] Disconnected. Attempting to reconnect...`);

        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5000)
          ]);
          console.log(`[${name}] Reconnection in progress.`);
        } catch {
          try { connection.destroy(); } catch {}
          scheduleReconnect();
        }
      });

      connection.on(VoiceConnectionStatus.Destroyed, () => {
        scheduleReconnect();
      });

    } catch (error) {
      console.error(`[${name}] VC error:`, error.message);
      scheduleReconnect();
    }
  }

  client.once(Events.ClientReady, async (bot) => {
    console.log(`[${name}] Logged in as ${bot.user.tag}`);

    const setStreaming = () =>
      bot.user.setPresence({
        status: "online",
        activities: [{ name: STREAM_TEXT, type: ActivityType.Streaming, url: STREAM_URL }]
      });
    setStreaming();
    setInterval(setStreaming, 10 * 60 * 1000); // re-apply every 10 min so it never resets

    await connectToVC();
  });

  client.login(token).catch((err) => {
    console.error(`[${name}] Login failed:`, err.message);
  });
}

BOTS.forEach(startBot);
