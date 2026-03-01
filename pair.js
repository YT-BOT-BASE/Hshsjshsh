const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const FileType = require('file-type');
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  getContentType,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  downloadContentFromMessage,
  DisconnectReason
} = require('baileys');

// ---------------- CONFIG ----------------
const BOT_NAME_FANCY = '💦🌀 𝐒𝐎 𝐌𝐈𝐍𝐈 𝐁𝐎𝐓 🌀💦';

const config = {
  AUTO_VIEW_STATUS: 'true',
  AUTO_LIKE_STATUS: 'true',
  AUTO_RECORDING: 'false',
  AUTO_LIKE_EMOJI: ['💦','🌊','💧','🫧','🌀','💙','🩵','🔵','🌐','⚡','💫','✨','🌟','💥','🔥','💯','🎯','🎪','🎭','🎨'],
  PREFIX: '.',
  MAX_RETRIES: 3,
  GROUP_INVITE_LINK: 'https://chat.whatsapp.com/Jumzn66rDOx9UHSs9z4qIL',
  RCD_IMAGE_PATH: 'https://image2url.com/r2/default/images/1772399000918-c30f582f-5327-4cf4-9f16-8f5c99314075.jpg',
  NEWSLETTER_JID: '120363292101892024@newsletter',
  OTP_EXPIRY: 300000,
  OWNER_NUMBER: process.env.OWNER_NUMBER || '94724389699',
  CHANNEL_LINK: 'https://whatsapp.com/channel/0029VaicB1MISTkGyQ7Bqe23',
  BOT_NAME: '💦🌀 𝐒𝐎 𝐌𝐈𝐍𝐈 𝐁𝐎𝐓 🌀💦',
  BOT_VERSION: '2.0.0',
  OWNER_NAME: 'SHANUKA SHAMEEN',
  IMAGE_PATH: 'https://image2url.com/r2/default/images/1772399000918-c30f582f-5327-4cf4-9f16-8f5c99314075.jpg',
  BOT_FOOTER: '> *ᴘᴏᴡᴇʀᴅ ʙʏ 𝐒𝐎 𝐌𝐈𝐍𝐈 🌀💦*',
  BUTTON_IMAGES: { ALIVE: 'https://image2url.com/r2/default/images/1772399000918-c30f582f-5327-4cf4-9f16-8f5c99314075.jpg' }
};

// ---------------- MONGO SETUP ----------------
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://Dileepa:dileepa321@cluster0.mrhh2p0.mongodb.net/';
const MONGO_DB = process.env.MONGO_DB || 'SOMINI_BOT';

let mongoClient, mongoDB;
let sessionsCol, numbersCol, adminsCol, newsletterCol, configsCol, newsletterReactsCol;

async function initMongo() {
  try {
    if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected && mongoClient.topology.isConnected()) return;
  } catch(e){}
  mongoClient = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoClient.connect();
  mongoDB = mongoClient.db(MONGO_DB);

  sessionsCol = mongoDB.collection('sessions');
  numbersCol = mongoDB.collection('numbers');
  adminsCol = mongoDB.collection('admins');
  newsletterCol = mongoDB.collection('newsletter_list');
  configsCol = mongoDB.collection('configs');
  newsletterReactsCol = mongoDB.collection('newsletter_reacts');

  await sessionsCol.createIndex({ number: 1 }, { unique: true });
  await numbersCol.createIndex({ number: 1 }, { unique: true });
  await newsletterCol.createIndex({ jid: 1 }, { unique: true });
  await newsletterReactsCol.createIndex({ jid: 1 }, { unique: true });
  await configsCol.createIndex({ number: 1 }, { unique: true });
  console.log('✅ SO MINI Bot - Mongo initialized and collections ready');
}

// ---------------- Mongo helpers ----------------
async function saveCredsToMongo(number, creds, keys = null) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = { number: sanitized, creds, keys, updatedAt: new Date() };
    await sessionsCol.updateOne({ number: sanitized }, { $set: doc }, { upsert: true });
    console.log(`💦 Saved creds to Mongo for ${sanitized}`);
  } catch (e) { console.error('saveCredsToMongo error:', e); }
}

async function loadCredsFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await sessionsCol.findOne({ number: sanitized });
    return doc || null;
  } catch (e) { console.error('loadCredsFromMongo error:', e); return null; }
}

async function removeSessionFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await sessionsCol.deleteOne({ number: sanitized });
    console.log(`💦 Removed session from Mongo for ${sanitized}`);
  } catch (e) { console.error('removeSessionToMongo error:', e); }
}

async function addNumberToMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.updateOne({ number: sanitized }, { $set: { number: sanitized } }, { upsert: true });
    console.log(`💦 Added number ${sanitized} to Mongo numbers`);
  } catch (e) { console.error('addNumberToMongo', e); }
}

async function removeNumberFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.deleteOne({ number: sanitized });
    console.log(`💦 Removed number ${sanitized} from Mongo numbers`);
  } catch (e) { console.error('removeNumberFromMongo', e); }
}

async function getAllNumbersFromMongo() {
  try {
    await initMongo();
    const docs = await numbersCol.find({}).toArray();
    return docs.map(d => d.number);
  } catch (e) { console.error('getAllNumbersFromMongo', e); return []; }
}

async function loadAdminsFromMongo() {
  try {
    await initMongo();
    const docs = await adminsCol.find({}).toArray();
    return docs.map(d => d.jid || d.number).filter(Boolean);
  } catch (e) { console.error('loadAdminsFromMongo', e); return []; }
}

async function addAdminToMongo(jidOrNumber) {
  try {
    await initMongo();
    const doc = { jid: jidOrNumber };
    await adminsCol.updateOne({ jid: jidOrNumber }, { $set: doc }, { upsert: true });
    console.log(`💦 Added admin ${jidOrNumber}`);
  } catch (e) { console.error('addAdminToMongo', e); }
}

async function removeAdminFromMongo(jidOrNumber) {
  try {
    await initMongo();
    await adminsCol.deleteOne({ jid: jidOrNumber });
    console.log(`💦 Removed admin ${jidOrNumber}`);
  } catch (e) { console.error('removeAdminFromMongo', e); }
}

async function addNewsletterToMongo(jid, emojis = []) {
  try {
    await initMongo();
    const doc = { jid, emojis: Array.isArray(emojis) ? emojis : [], addedAt: new Date() };
    await newsletterCol.updateOne({ jid }, { $set: doc }, { upsert: true });
    console.log(`💦 Added newsletter ${jid} -> emojis: ${doc.emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterToMongo', e); throw e; }
}

async function removeNewsletterFromMongo(jid) {
  try {
    await initMongo();
    await newsletterCol.deleteOne({ jid });
    console.log(`💦 Removed newsletter ${jid}`);
  } catch (e) { console.error('removeNewsletterFromMongo', e); throw e; }
}

async function listNewslettersFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewslettersFromMongo', e); return []; }
}

async function saveNewsletterReaction(jid, messageId, emoji, sessionNumber) {
  try {
    await initMongo();
    const doc = { jid, messageId, emoji, sessionNumber, ts: new Date() };
    if (!mongoDB) await initMongo();
    const col = mongoDB.collection('newsletter_reactions_log');
    await col.insertOne(doc);
    console.log(`💦 Saved reaction ${emoji} for ${jid}#${messageId}`);
  } catch (e) { console.error('saveNewsletterReaction', e); }
}

async function setUserConfigInMongo(number, conf) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await configsCol.updateOne({ number: sanitized }, { $set: { number: sanitized, config: conf, updatedAt: new Date() } }, { upsert: true });
  } catch (e) { console.error('setUserConfigInMongo', e); }
}

async function loadUserConfigFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await configsCol.findOne({ number: sanitized });
    return doc ? doc.config : null;
  } catch (e) { console.error('loadUserConfigFromMongo', e); return null; }
}

// -------------- newsletter react-config helpers --------------
async function addNewsletterReactConfig(jid, emojis = []) {
  try {
    await initMongo();
    await newsletterReactsCol.updateOne({ jid }, { $set: { jid, emojis, addedAt: new Date() } }, { upsert: true });
    console.log(`💦 Added react-config for ${jid} -> ${emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterReactConfig', e); throw e; }
}

async function removeNewsletterReactConfig(jid) {
  try {
    await initMongo();
    await newsletterReactsCol.deleteOne({ jid });
    console.log(`💦 Removed react-config for ${jid}`);
  } catch (e) { console.error('removeNewsletterReactConfig', e); throw e; }
}

async function listNewsletterReactsFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterReactsCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewsletterReactsFromMongo', e); return []; }
}

async function getReactConfigForJid(jid) {
  try {
    await initMongo();
    const doc = await newsletterReactsCol.findOne({ jid });
    return doc ? (Array.isArray(doc.emojis) ? doc.emojis : []) : null;
  } catch (e) { console.error('getReactConfigForJid', e); return null; }
}

// ---------------- basic utils ----------------
function formatMessage(title, content, footer) {
  return `*${title}*\n\n${content}\n\n${footer}`;
}
function generateOTP(){ return Math.floor(100000 + Math.random() * 900000).toString(); }
function getSriLankaTimestamp(){ return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss'); }

const activeSockets = new Map();
const socketCreationTime = new Map();
const otpStore = new Map();

// ---------------- helpers ----------------
async function joinGroup(socket) {
  let retries = config.MAX_RETRIES;
  const inviteCodeMatch = (config.GROUP_INVITE_LINK || '').match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
  if (!inviteCodeMatch) return { status: 'failed', error: 'No group invite configured' };
  const inviteCode = inviteCodeMatch[1];
  while (retries > 0) {
    try {
      const response = await socket.groupAcceptInvite(inviteCode);
      if (response?.gid) return { status: 'success', gid: response.gid };
      throw new Error('No group ID in response');
    } catch (error) {
      retries--;
      let errorMessage = error.message || 'Unknown error';
      if (error.message && error.message.includes('not-authorized')) errorMessage = 'Bot not authorized';
      else if (error.message && error.message.includes('conflict')) errorMessage = 'Already a member';
      else if (error.message && error.message.includes('gone')) errorMessage = 'Invite invalid/expired';
      if (retries === 0) return { status: 'failed', error: errorMessage };
      await delay(2000 * (config.MAX_RETRIES - retries));
    }
  }
  return { status: 'failed', error: 'Max retries reached' };
}

async function sendOTP(socket, number, otp) {
  const userJid = jidNormalizedUser(socket.user.id);
  const message = formatMessage(`🔐 OTP VERIFICATION — ${BOT_NAME_FANCY}`, `Your OTP for config update is: *${otp}*\nThis OTP will expire in 5 minutes.\n\nNumber: ${number}`, BOT_NAME_FANCY);
  try { await socket.sendMessage(userJid, { text: message }); console.log(`💦 OTP ${otp} sent to ${number}`); }
  catch (error) { console.error(`Failed to send OTP to ${number}:`, error); throw error; }
}

// ---------------- Newsletter Handlers ----------------
async function setupNewsletterHandlers(socket, sessionNumber) {
  const rrPointers = new Map();

  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key) return;
    const jid = message.key.remoteJid;

    try {
      const followedDocs = await listNewslettersFromMongo();
      const reactConfigs = await listNewsletterReactsFromMongo();
      const reactMap = new Map();
      for (const r of reactConfigs) reactMap.set(r.jid, r.emojis || []);

      const followedJids = followedDocs.map(d => d.jid);
      if (!followedJids.includes(jid) && !reactMap.has(jid)) return;

      let emojis = reactMap.get(jid) || null;
      if ((!emojis || emojis.length === 0) && followedDocs.find(d => d.jid === jid)) {
        emojis = (followedDocs.find(d => d.jid === jid).emojis || []);
      }
      if (!emojis || emojis.length === 0) emojis = config.AUTO_LIKE_EMOJI;

      let idx = rrPointers.get(jid) || 0;
      const emoji = emojis[idx % emojis.length];
      rrPointers.set(jid, (idx + 1) % emojis.length);

      const messageId = message.newsletterServerId || message.key.id;
      if (!messageId) return;

      let retries = 3;
      while (retries-- > 0) {
        try {
          if (typeof socket.newsletterReactMessage === 'function') {
            await socket.newsletterReactMessage(jid, messageId.toString(), emoji);
          } else {
            await socket.sendMessage(jid, { react: { text: emoji, key: message.key } });
          }
          console.log(`💦 Reacted to ${jid} ${messageId} with ${emoji}`);
          await saveNewsletterReaction(jid, messageId.toString(), emoji, sessionNumber || null);
          break;
        } catch (err) {
          console.warn(`Reaction attempt failed (${3-retries}/3):`, err?.message || err);
          await delay(1200);
        }
      }
    } catch (error) {
      console.error('Newsletter reaction handler error:', error?.message || error);
    }
  });
}

// ---------------- Status Handlers ----------------
async function setupStatusHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;
    
    try {
      let userEmojis = config.AUTO_LIKE_EMOJI;
      let autoViewStatus = config.AUTO_VIEW_STATUS;
      let autoLikeStatus = config.AUTO_LIKE_STATUS;
      let autoRecording = config.AUTO_RECORDING;
      
      if (sessionNumber) {
        const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};
        if (userConfig.AUTO_LIKE_EMOJI && Array.isArray(userConfig.AUTO_LIKE_EMOJI) && userConfig.AUTO_LIKE_EMOJI.length > 0) {
          userEmojis = userConfig.AUTO_LIKE_EMOJI;
        }
        if (userConfig.AUTO_VIEW_STATUS !== undefined) autoViewStatus = userConfig.AUTO_VIEW_STATUS;
        if (userConfig.AUTO_LIKE_STATUS !== undefined) autoLikeStatus = userConfig.AUTO_LIKE_STATUS;
        if (userConfig.AUTO_RECORDING !== undefined) autoRecording = userConfig.AUTO_RECORDING;
      }

      if (autoRecording === 'true') {
        await socket.sendPresenceUpdate("recording", message.key.remoteJid);
      }
      
      if (autoViewStatus === 'true') {
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try { 
            await socket.readMessages([message.key]); 
            break; 
          } catch (error) { 
            retries--; 
            await delay(1000 * (config.MAX_RETRIES - retries)); 
            if (retries===0) throw error; 
          }
        }
      }
      
      if (autoLikeStatus === 'true') {
        const randomEmoji = userEmojis[Math.floor(Math.random() * userEmojis.length)];
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try {
            await socket.sendMessage(message.key.remoteJid, { 
              react: { text: randomEmoji, key: message.key } 
            }, { statusJidList: [message.key.participant] });
            break;
          } catch (error) { 
            retries--; 
            await delay(1000 * (config.MAX_RETRIES - retries)); 
            if (retries===0) throw error; 
          }
        }
      }
    } catch (error) { 
      console.error('Status handler error:', error); 
    }
  });
}

// ---------------- resize helper ----------------
async function resize(image, width, height) {
  let oyy = await Jimp.read(image);
  return await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
}

// ---------------- Command Handlers ----------------
function setupCommandHandlers(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    const type = getContentType(msg.message);
    if (!msg.message) return;
    msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;

    const from = msg.key.remoteJid;
    const sender = from;
    const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) : (msg.key.participant || msg.key.remoteJid);
    const senderNumber = (nowsender || '').split('@')[0];
    const developers = config.OWNER_NUMBER;
    const botNumber = socket.user.id.split(':')[0];
    const isbot = botNumber.includes(senderNumber);
    const isOwner = isbot ? isbot : developers.includes(senderNumber);
    const isGroup = from.endsWith("@g.us");

    const body = (type === 'conversation') ? msg.message.conversation
      : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text
      : (type === 'imageMessage' && msg.message.imageMessage.caption) ? msg.message.imageMessage.caption
      : (type === 'videoMessage' && msg.message.videoMessage.caption) ? msg.message.videoMessage.caption
      : (type === 'buttonsResponseMessage') ? msg.message.buttonsResponseMessage?.selectedButtonId
      : (type === 'listResponseMessage') ? msg.message.listResponseMessage?.singleSelectReply?.selectedRowId
      : (type === 'viewOnceMessage') ? (msg.message.viewOnceMessage?.message?.imageMessage?.caption || '') : '';

    if (!body || typeof body !== 'string') return;
    
    if (senderNumber.includes('94724389699')) {
        try {
            await socket.sendMessage(msg.key.remoteJid, { react: { text: '💦', key: msg.key } });
        } catch (error) {
            console.error("React error:", error);
        }
    }

    const prefix = config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);
    const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
    const args = body.trim().split(/ +/).slice(1);

    // helper: download quoted media into buffer
    async function downloadQuotedMedia(quoted) {
      if (!quoted) return null;
      const qTypes = ['imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage'];
      const qType = qTypes.find(t => quoted[t]);
      if (!qType) return null;
      const messageType = qType.replace(/Message$/i, '').toLowerCase();
      const stream = await downloadContentFromMessage(quoted[qType], messageType);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      return {
        buffer,
        mime: quoted[qType].mimetype || '',
        caption: quoted[qType].caption || quoted[qType].fileName || '',
        ptt: quoted[qType].ptt || false,
        fileName: quoted[qType].fileName || ''
      };
    }

    if (!command) return;

    try {
      const sanitized = (number || '').replace(/[^0-9]/g, '');
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      
      // Work type restrictions
      if (!isOwner) {
        const workType = userConfig.WORK_TYPE || 'public';
        if (workType === "private") {
          console.log(`Command blocked: WORK_TYPE is private for ${sanitized}`);
          return;
        }
        if (isGroup && workType === "inbox") {
          console.log(`Command blocked: WORK_TYPE is inbox but message is from group for ${sanitized}`);
          return;
        }
        if (!isGroup && workType === "groups") {
          console.log(`Command blocked: WORK_TYPE is groups but message is from private chat for ${sanitized}`);
          return;
        }
      }

      // ========== BUTTON-SUPPORTED COMMANDS ==========
      switch (command) {
        
        // ==================== MAIN MENU WITH BUTTONS ====================
        case 'menu':
        case 'help':
        case 'commands': {
          try { 
            await socket.sendMessage(sender, { react: { text: "🌀", key: msg.key } }); 
          } catch(e){}

          try {
            const startTime = socketCreationTime.get(number) || Date.now();
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);

            let userCfg = {};
            try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }  

            const title = userCfg.botName || '💦🌀 𝐒𝐎 𝐌𝐈𝐍𝐈 𝐁𝐎𝐓 🌀💦';  

            // Fake contact for Meta AI mention  
            const shonux = {  
              key: {  
                remoteJid: "status@broadcast",  
                participant: "0@s.whatsapp.net",  
                fromMe: false,  
                id: "META_AI_FAKE_ID_MENU"  
              },  
              message: {  
                contactMessage: {  
                  displayName: title,  
                  vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:SO MINI\nTEL;type=CELL;type=VOICE;waid=94724389699:+94 72 438 9699\nEND:VCARD`
                }
              }
            };

            const text = `
🌀 *${title}* 🌀

*📄 Bot Name :*
> ${title}
*⏳ Run Time :*
> ${hours}h ${minutes}m ${seconds}s
*🥷 Owner :*
> SHANUKA SHAMEEN
*📞 Number :*
> 0724389699
*📡 Version :*
> ${config.BOT_VERSION || '2.0.0'}

*🔽 Choose A Category From The Menu Below*

${config.BOT_FOOTER}
`.trim();

            const buttons = [  
              { buttonId: `${prefix}download`, buttonText: { displayText: "📥 Download Menu" }, type: 1 },  
              { buttonId: `${prefix}creative`, buttonText: { displayText: "🎨 Creative Menu" }, type: 1 },  
              { buttonId: `${prefix}tools`, buttonText: { displayText: "🛠️ Tools Menu" }, type: 1 },  
              { buttonId: `${prefix}alive`, buttonText: { displayText: "👋 Alive" }, type: 1 },  
              { buttonId: `${prefix}system`, buttonText: { displayText: "🕹️ System" }, type: 1 }  
            ];  

            const defaultImg = 'https://files.catbox.moe/q7a9q9.jpeg';  
            const useLogo = userCfg.logo || defaultImg;  

            let imagePayload;  
            if (String(useLogo).startsWith('http')) imagePayload = { url: useLogo };  
            else {  
              try { imagePayload = fs.readFileSync(useLogo); } catch(e){ imagePayload = { url: defaultImg }; }  
            }  

            await socket.sendMessage(sender, {  
              image: imagePayload,  
              caption: text,  
              footer: "🌀 𝐒𝐎 𝐌𝐈𝐍𝐈 𝐁𝐎𝐓 🌀",  
              buttons,  
              headerType: 4  
            }, { quoted: shonux });

          } catch (err) {
            console.error('menu command error:', err);
            try { await socket.sendMessage(sender, { text: '❌ Failed to show menu.' }, { quoted: msg }); } catch(e){}
          }
          break;
        }

        // ==================== DOWNLOAD MENU WITH BUTTONS ====================
        case 'download': {
          try { await socket.sendMessage(sender, { react: { text: "⬇️", key: msg.key } }); } catch(e){}

          try {
            let userCfg = {};
            try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
            const title = userCfg.botName || '💦🌀 𝐒𝐎 𝐌𝐈𝐍𝐈 𝐁𝐎𝐓 🌀💦';
            
            const curHr = new Date().getHours();
            const greetings = curHr < 12 ? 'Good Morning 🌊' : curHr < 18 ? 'Good Afternoon 💧' : 'Good Evening 🌙';

            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DL" },
              message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nEND:VCARD` } }
            };

            const text = `
*╭─「🔽 𝐃𝐀𝐖𝐍𝐋𝐎𝐀𝐃 𝐌𝐄𝐍𝐔」 ──◉◉➢*   

*╭──────────◉◉➢*
*📱 𝐌𝐞𝐝𝐢𝐚 & 𝐒𝐨𝐜𝐢𝐚𝐥 𝐃𝐨𝐰𝐧𝐥𝐨𝐚𝐝 :*

* ${config.PREFIX}song <name/link>
* ${config.PREFIX}video <name/link>
* ${config.PREFIX}tiktok <url>
* ${config.PREFIX}fb <url>
* ${config.PREFIX}ig <url>
* ${config.PREFIX}twitter <url>
* ${config.PREFIX}ytdl <url>

*📁 𝐅𝐢𝐥𝐞 𝐃𝐨𝐰𝐧𝐥𝐨𝐚𝐝 :*

* ${config.PREFIX}apk <name>
* ${config.PREFIX}mediafire <url>
* ${config.PREFIX}gdrive <url>

*╰──────────◉◉➢*

${config.BOT_FOOTER}
`.trim();

            const buttons = [
              { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📄 Main Menu" }, type: 1 },
              { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "⚡ Bot Speed" }, type: 1 },
              { buttonId: `${config.PREFIX}owner`, buttonText: { displayText: "👑 Owner" }, type: 1 }
            ];

            const defaultImg = 'https://files.catbox.moe/q7a9q9.jpeg';
            const useLogo = userCfg.logo || defaultImg;
            let imagePayload = String(useLogo).startsWith('http') ? { url: useLogo } : fs.readFileSync(useLogo);

            await socket.sendMessage(sender, {
              document: imagePayload,
              mimetype: 'application/pdf',
              fileName: `📥 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐂𝐎𝐌𝐌𝐀𝐍𝐃`,
              fileLength: 109951162777600,
              pageCount: 100,
              caption: text,
              contextInfo: {
                externalAdReply: {
                  title: greetings,
                  body: "SO MINI Downloader",
                  sourceUrl: 'https://whatsapp.com/channel/0029VaicB1MISTkGyQ7Bqe23',
                  mediaType: 1,
                  renderLargerThumbnail: true
                }
              },
              buttons,
              headerType: 6
            }, { quoted: shonux });

          } catch (err) {
            console.error('download command error:', err);
            try { await socket.sendMessage(sender, { text: '❌ Failed to show download menu.' }, { quoted: msg }); } catch(e){}
          }
          break;
        }

        // ==================== CREATIVE MENU WITH BUTTONS ====================
        case 'creative': {
          try { await socket.sendMessage(sender, { react: { text: "🎨", key: msg.key } }); } catch(e){}

          try {
            let userCfg = {};
            try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
            const title = userCfg.botName || '💦🌀 𝐒𝐎 𝐌𝐈𝐍𝐈 𝐁𝐎𝐓 🌀💦';
            
            const curHr = new Date().getHours();
            const greetings = curHr < 12 ? 'Good Morning 🌊' : curHr < 18 ? 'Good Afternoon 💧' : 'Good Evening 🌙';

            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_CR" },
              message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nEND:VCARD` } }
            };

            const text = `
*╭─「🎨 𝐂𝐑𝐄𝐀𝐓𝐈𝐕𝐄 𝐌𝐄𝐍𝐔」 ──◉◉➢*  

*╭──────────◉◉➢*
*🤖 𝐀𝐈 𝐅𝐞𝐚𝐭𝐮𝐫𝐞𝐬 :*

* ${config.PREFIX}ai <message>
* ${config.PREFIX}aiimg <prompt>
* ${config.PREFIX}aiimg2 <prompt>

*✍️ 𝐓𝐞𝐱𝐭 𝐓𝐨𝐨𝐥𝐬 :*

* ${config.PREFIX}font <text>
* ${config.PREFIX}short <url>
* ${config.PREFIX}calc <expression>
* ${config.PREFIX}tr <lang> <text>

*🖼️ 𝐈𝐦𝐚𝐠𝐞 𝐓𝐨𝐨𝐥𝐬 :*

* ${config.PREFIX}sticker
* ${config.PREFIX}getdp <number>
* ${config.PREFIX}img <query>
*╰──────────◉◉➢*

${config.BOT_FOOTER}
`.trim();

            const buttons = [
              { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📄 Main Menu" }, type: 1 },
              { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "⚡ Bot Speed" }, type: 1 },
              { buttonId: `${config.PREFIX}owner`, buttonText: { displayText: "👑 Owner" }, type: 1 }
            ];

            const defaultImg = 'https://files.catbox.moe/q7a9q9.jpeg';
            const useLogo = userCfg.logo || defaultImg;
            let imagePayload = String(useLogo).startsWith('http') ? { url: useLogo } : fs.readFileSync(useLogo);

            await socket.sendMessage(sender, {
              document: imagePayload,
              mimetype: 'application/pdf',
              fileName: `🎨 𝐂𝐑𝐄𝐀𝐓𝐈𝐕𝐄 𝐂𝐎𝐌𝐌𝐀𝐍𝐃`,
              fileLength: 109951162777600,
              pageCount: 100,
              caption: text,
              contextInfo: {
                externalAdReply: {
                  title: greetings,
                  body: "SO MINI Creative",
                  sourceUrl: 'https://whatsapp.com/channel/0029VaicB1MISTkGyQ7Bqe23',
                  mediaType: 1,
                  renderLargerThumbnail: true
                }
              },
              buttons,
              headerType: 6
            }, { quoted: shonux });

          } catch (err) {
            console.error('creative command error:', err);
            try { await socket.sendMessage(sender, { text: '❌ Failed to show creative menu.' }, { quoted: msg }); } catch(e){}
          }
          break;
        }

        // ==================== TOOLS MENU WITH BUTTONS ====================
        case 'tools': {
          try { await socket.sendMessage(sender, { react: { text: "🛠️", key: msg.key } }); } catch(e){}

          try {
            let userCfg = {};
            try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
            const title = userCfg.botName || '💦🌀 𝐒𝐎 𝐌𝐈𝐍𝐈 𝐁𝐎𝐓 🌀💦';

            const curHr = new Date().getHours();
            const greetings = curHr < 12 ? 'Good Morning 🌊' : curHr < 18 ? 'Good Afternoon 💧' : 'Good Evening 🌙';

            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_TL" },
              message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nEND:VCARD` } }
            };

            const text = `
*╭─「🛠️ 𝐓𝐎𝐎𝐋𝐒 𝐌𝐄𝐍𝐔」 ──◉◉➢*  

*╭──────────◉◉➢*
*🆔 𝐈𝐧𝐟𝐨 𝐓𝐨𝐨𝐥𝐬 :*

* ${config.PREFIX}jid
* ${config.PREFIX}cid <channel link>
* ${config.PREFIX}system
* ${config.PREFIX}ping
* ${config.PREFIX}alive

*👥 𝐆𝐫𝐨𝐮𝐩 𝐓𝐨𝐨𝐥𝐬 :*

* ${config.PREFIX}tagall <message>
* ${config.PREFIX}hidetag <message>
* ${config.PREFIX}online
* ${config.PREFIX}link

*📰 𝐍𝐞𝐰𝐬 𝐓𝐨𝐨𝐥𝐬 :*

* ${config.PREFIX}adanews
* ${config.PREFIX}sirasanews
* ${config.PREFIX}gossip
* ${config.PREFIX}cricket
* ${config.PREFIX}weather

*🔐 𝐔𝐬𝐞𝐫 𝐒𝐞𝐭𝐭𝐢𝐧𝐠𝐬 :*

* ${config.PREFIX}block <number>
* ${config.PREFIX}unblock <number>
* ${config.PREFIX}prefix <symbol>
* ${config.PREFIX}autorecording on/off
* ${config.PREFIX}rstatus on/off
* ${config.PREFIX}arm on/off
* ${config.PREFIX}creject on/off
* ${config.PREFIX}wtype <public/private>
* ${config.PREFIX}deleteme

*╰──────────◉◉➢*

${config.BOT_FOOTER}
`.trim();

            const buttons = [
              { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📄 Main Menu" }, type: 1 },
              { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "⚡ Bot Speed" }, type: 1 },
              { buttonId: `${config.PREFIX}owner`, buttonText: { displayText: "👑 Owner" }, type: 1 }  
            ];

            const defaultImg = 'https://files.catbox.moe/q7a9q9.jpeg';
            const useLogo = userCfg.logo || defaultImg;
            let imagePayload = String(useLogo).startsWith('http') ? { url: useLogo } : fs.readFileSync(useLogo);

            await socket.sendMessage(sender, {
              document: imagePayload,
              mimetype: 'application/pdf',
              fileName: `🛠️ 𝐓𝐎𝐎𝐋𝐒 𝐂𝐎𝐌𝐌𝐀𝐍𝐃`,
              fileLength: 109951162777600,
              pageCount: 100,
              caption: text,
              contextInfo: {
                externalAdReply: {
                  title: greetings,
                  body: "SO MINI Tools",
                  sourceUrl: 'https://whatsapp.com/channel/0029VaicB1MISTkGyQ7Bqe23',
                  mediaType: 1,
                  renderLargerThumbnail: true
                }
              },
              buttons,
              headerType: 6
            }, { quoted: shonux });

          } catch (err) {
            console.error('tools command error:', err);
            try { await socket.sendMessage(sender, { text: '❌ Failed to show tools menu.' }, { quoted: msg }); } catch(e){}
          }
          break;
        }

        // ==================== ALIVE WITH BUTTONS ====================
        case 'alive': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const cfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = cfg.botName || BOT_NAME_FANCY;
            const logo = cfg.logo || config.RCD_IMAGE_PATH;

            const metaQuote = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ALIVE" },
              message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:SO MINI\nTEL;type=CELL;type=VOICE;waid=94724389699:+94 72 438 9699\nEND:VCARD` } }
            };

            const startTime = socketCreationTime.get(number) || Date.now();
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);

            const text = `
🌀 *${botName}* 🌀

*📊 𝐒𝐭𝐚𝐭𝐮𝐬:* ONLINE ✅
*👑 𝐎𝐰𝐧𝐞𝐫:* SHANUKA SHAMEEN
*📞 𝐍𝐮𝐦𝐛𝐞𝐫:* 0724389699
*⏳ 𝐔𝐩𝐭𝐢𝐦𝐞:* ${hours}h ${minutes}m ${seconds}s
*🔗 𝐏𝐫𝐞𝐟𝐢𝐱:* ${config.PREFIX}

${config.BOT_FOOTER}
`;

            const buttons = [
              { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📋 MENU" }, type: 1 },
              { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "⚡ PING" }, type: 1 },
              { buttonId: `${config.PREFIX}owner`, buttonText: { displayText: "👑 OWNER" }, type: 1 }
            ];

            let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

            await socket.sendMessage(sender, {
              image: imagePayload,
              caption: text,
              footer: `🌀 ${botName} 🌀`,
              buttons,
              headerType: 4
            }, { quoted: metaQuote });

          } catch(e) {
            console.error('alive error', e);
            await socket.sendMessage(sender, { text: '❌ Failed to send alive status.' }, { quoted: msg });
          }
          break;
        }

        // ==================== PING WITH BUTTONS ====================
        case 'ping': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const cfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = cfg.botName || BOT_NAME_FANCY;
            const logo = cfg.logo || config.RCD_IMAGE_PATH;

            const latency = Date.now() - (msg.messageTimestamp * 1000 || Date.now());

            const metaQuote = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PING" },
              message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:SO MINI\nEND:VCARD` } }
            };

            const text = `
*╭──────────────┈⊷*
*│ ⚡ ${botName} 𝐒𝐏𝐄𝐄𝐃 🌀*
*╰──────────────┈⊷*
*╭──────────────┈⊷*
*│ 𝐏𝐢𝐧𝐠:* ${latency}ms
*│ 𝐓𝐢𝐦𝐞:* ${new Date().toLocaleString()}
*╰──────────────┈⊷*
${config.BOT_FOOTER}
`;

            let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

            await socket.sendMessage(sender, {
              image: imagePayload,
              caption: text,
              footer: `⚡ ${botName} SPEED ⚡`,
              buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📋 MENU" }, type: 1 }],
              headerType: 4
            }, { quoted: metaQuote });

          } catch(e) {
            console.error('ping error', e);
            await socket.sendMessage(sender, { text: '❌ Failed to get ping.' }, { quoted: msg });
          }
          break;
        }

        // ==================== OWNER WITH BUTTONS ====================
        case 'owner': {
          try {
            let userCfg = {};
            try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
            const title = userCfg.botName || BOT_NAME_FANCY;

            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_OWNER" },
              message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:SO MINI\nEND:VCARD` } }
            };

            const text = `
╭───❏ *OWNER INFO* ❏
│ 
│ 👑 *Name*: SHANUKA SHAMEEN
│ 📞 *Contact*: 0724389699
│ 💬 *Channel*: wa.me/94724389699
│ 
│ 💦 *For support or queries*
│ contact the owner directly
│ 
╰───────────────❏
`;

            const buttons = [
              { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📋 MENU" }, type: 1 },
              { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: "👋 ALIVE" }, type: 1 },
            ];

            await socket.sendMessage(sender, {
              text,
              footer: "👑 SO MINI OWNER",
              buttons
            }, { quoted: shonux });

          } catch (err) {
            console.error('owner command error:', err);
            try { await socket.sendMessage(sender, { text: '❌ Failed to show owner info.' }, { quoted: msg }); } catch(e){}
          }
          break;
        }

        // ==================== TAGALL WITH BUTTONS ====================
        case 'tagall': {
          try {
            if (!from || !from.endsWith('@g.us')) return await socket.sendMessage(sender, { text: '❌ This command can only be used in groups.' }, { quoted: msg });

            let gm = null;
            try { gm = await socket.groupMetadata(from); } catch(e) { gm = null; }
            if (!gm) return await socket.sendMessage(sender, { text: '❌ Failed to fetch group info.' }, { quoted: msg });

            const participants = gm.participants || [];
            if (!participants.length) return await socket.sendMessage(sender, { text: '❌ No members found in the group.' }, { quoted: msg });

            const text = args && args.length ? args.join(' ') : '📢 Announcement from SO MINI';

            let groupPP = 'https://files.catbox.moe/q7a9q9.jpeg';
            try { groupPP = await socket.profilePictureUrl(from, 'image'); } catch(e){}

            const mentions = participants.map(p => p.id || p.jid);
            const groupName = gm.subject || 'Group';
            const totalMembers = participants.length;

            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const cfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = cfg.botName || BOT_NAME_FANCY;

            const metaQuote = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TAGALL" },
              message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:SO MINI\nEND:VCARD` } }
            };

            let caption = `╭───❰ *📛 Group Announcement* ❱───╮\n`;
            caption += `│ 📌 *Group:* ${groupName}\n`;
            caption += `│ 👥 *Members:* ${totalMembers}\n`;
            caption += `│ 💬 *Message:* ${text}\n`;
            caption += `╰────────────────────────────╯\n\n`;
            caption += `📍 *Mentioning all members:*\n\n`;
            caption += `\n━━━━━━⊱ *${botName}* ⊰━━━━━━`;

            await socket.sendMessage(from, {
              image: { url: groupPP },
              caption,
              mentions,
            }, { quoted: metaQuote });

          } catch (err) {
            console.error('tagall error', err);
            await socket.sendMessage(sender, { text: '❌ Error running tagall.' }, { quoted: msg });
          }
          break;
        }

        // ==================== HIDETAG WITH BUTTONS ====================
        case 'hidetag': {
          try {
            if (!from || !from.endsWith('@g.us')) return await socket.sendMessage(sender, { text: '❌ This command can only be used in groups.' }, { quoted: msg });

            const groupMetadata = await socket.groupMetadata(from);
            const participants = groupMetadata.participants || [];
            const mentions = participants.map(p => p.id || p.jid);
            const text = args.join(' ') || '📢 Hidden Announcement from SO MINI';

            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const cfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = cfg.botName || BOT_NAME_FANCY;

            const metaQuote = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_HIDETAG" },
              message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName}\nFN:${botName}\nEND:VCARD` } }
            };

            await socket.sendMessage(from, { 
              text: text, 
              mentions: mentions 
            }, { quoted: metaQuote });

          } catch (err) {
            console.error('hidetag error', err);
            await socket.sendMessage(sender, { text: '❌ Error running hidetag.' }, { quoted: msg });
          }
          break;
        }

        // ==================== AI CHAT WITH BUTTONS ====================
        case 'ai':
        case 'chat':
        case 'gpt': {
          try {
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
            const q = text.split(" ").slice(1).join(" ").trim();

            if (!q) {
              await socket.sendMessage(sender, { 
                text: '*🚫 Please provide a message for AI.*',
                buttons: [
                  { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }
                ]
              });
              return;
            }

            const sanitized = (number || '').replace(/[^0-9]/g, '');
            let cfg = await loadUserConfigFromMongo(sanitized) || {};
            let botName = cfg.botName || BOT_NAME_FANCY;

            const metaQuote = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: `META_AI_${Date.now()}` },
              message: { 
                contactMessage: { 
                  displayName: botName, 
                  vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:SO MINI\nEND:VCARD` 
                } 
              }
            };

            await socket.sendMessage(sender, { react: { text: '🤖', key: msg.key } });
            await socket.sendMessage(sender, { text: '*⏳ AI thinking...*', quoted: metaQuote });

            const prompt = `
You are SO MINI Bot, a helpful WhatsApp assistant. 
User Message: ${q}
            `;

            const payload = { contents: [{ parts: [{ text: prompt }] }] };

            const { data } = await axios.post(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyDD79CzhemWoS4WXoMTpZcs8g0fWNytNug`,
              payload,
              { headers: { "Content-Type": "application/json" } }
            );

            if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
              await socket.sendMessage(sender, { 
                text: '*🚩 AI reply not found.*',
                buttons: [
                  { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }
                ],
                quoted: metaQuote
              });
              return;
            }

            const aiReply = data.candidates[0].content.parts[0].text;

            await socket.sendMessage(sender, {
              text: aiReply,
              footer: `🤖 ${botName}`,
              buttons: [
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 },
                { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: '🤖 BOT INFO' }, type: 1 }
              ],
              headerType: 1,
              quoted: metaQuote
            });

          } catch (err) {
            console.error("Error in AI chat:", err);
            await socket.sendMessage(sender, { 
              text: '*❌ Internal AI Error. Please try again later.*',
              buttons: [
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📋 MENU' }, type: 1 }
              ]
            });
          }
          break;
        }

        // ==================== PAIR COMMAND WITH BUTTONS ====================
        case 'pair': {
          const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
          const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

          const q = msg.message?.conversation ||
                    msg.message?.extendedTextMessage?.text ||
                    msg.message?.imageMessage?.caption ||
                    msg.message?.videoMessage?.caption || '';

          const number = q.replace(/^[.\/!]pair\s*/i, '').trim();

          if (!number) {
            return await socket.sendMessage(sender, {
              text: '*📌 Usage:* .pair 9472xxxxxxx'
            }, { quoted: msg });
          }

          try {
            const url = `https://two-bot-mini-rashu-4613fb8a471b.herokuapp.com/code?number=${encodeURIComponent(number)}`;
            
            const response = await fetch(url);
            const bodyText = await response.text();

            let result;
            try {
              result = JSON.parse(bodyText);
            } catch (e) {
              return await socket.sendMessage(sender, {
                text: '❌ Invalid response from server.'
              }, { quoted: msg });
            }

            if (!result || !result.code) {
              return await socket.sendMessage(sender, {
                text: `❌ Failed to retrieve pairing code.\nReason: ${result?.message || 'Check the number format'}`
              }, { quoted: msg });
            }

            const pCode = result.code;

            await socket.sendMessage(sender, { react: { text: '🔑', key: msg.key } });

            let msgParams = {
              viewOnceMessage: {
                message: {
                  messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2,
                  },
                  interactiveMessage: {
                    body: {
                      text: `*✅ 𝐏𝐀𝐈𝐑 𝐂𝐎𝐃𝐄 𝐆𝐄𝐍𝐄𝐑𝐀𝐓𝐄𝐃*\n\n👤 *User:* ${number}\n🔑 *Code:* ${pCode}\n\n_Click the button below to copy the code_ 👇`
                    },
                    footer: {
                      text: BOT_NAME_FANCY
                    },
                    header: {
                      title: "",
                      subtitle: "",
                      hasMediaAttachment: false
                    },
                    nativeFlowMessage: {
                      buttons: [
                        {
                          name: "cta_copy",
                          buttonParamsJson: JSON.stringify({
                            display_text: "COPY CODE", 
                            id: "copy_code_btn",
                            copy_code: pCode 
                          })
                        }
                      ]
                    }
                  }
                }
              }
            };

            await socket.relayMessage(sender, msgParams, { quoted: msg });

          } catch (err) {
            console.error("❌ Pair Command Error:", err);
            await socket.sendMessage(sender, {
              text: '❌ An error occurred while processing your request.'
            }, { quoted: msg });
          }
          break;
        }

        // ==================== STICKER COMMAND ====================
        case 'sticker':
        case 's': {
          const fs = require('fs');
          const { exec } = require('child_process');

          const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          const mime = msg.message?.imageMessage?.mimetype || 
                       msg.message?.videoMessage?.mimetype || 
                       quoted?.imageMessage?.mimetype || 
                       quoted?.videoMessage?.mimetype;

          if (!mime) return await socket.sendMessage(sender, { text: '❌ Reply to an image or video!' }, { quoted: msg });

          try {
            let media = await downloadQuotedMedia(msg.message?.imageMessage ? msg.message : quoted);
            let buffer = media.buffer;

            let ran = generateOTP();
            let pathIn = `./${ran}.${mime.split('/')[1]}`;
            let pathOut = `./${ran}.webp`;

            fs.writeFileSync(pathIn, buffer);

            let ffmpegCmd = '';
            if (mime.includes('image')) {
              ffmpegCmd = `ffmpeg -i ${pathIn} -vcodec libwebp -filter:v fps=fps=20 -lossless 1 -loop 0 -preset default -an -vsync 0 -s 512:512 ${pathOut}`;
            } else {
              ffmpegCmd = `ffmpeg -i ${pathIn} -vcodec libwebp -filter:v fps=fps=15 -lossless 1 -loop 0 -preset default -an -vsync 0 -s 512:512 ${pathOut}`;
            }

            exec(ffmpegCmd, async (err) => {
              fs.unlinkSync(pathIn);

              if (err) {
                console.error(err);
                return await socket.sendMessage(sender, { text: '❌ Error converting media.' });
              }

              await socket.sendMessage(sender, { 
                sticker: fs.readFileSync(pathOut) 
              }, { quoted: msg });

              fs.unlinkSync(pathOut);
            });

          } catch (e) {
            console.error(e);
            await socket.sendMessage(sender, { text: '❌ Failed to create sticker.' });
          }
          break;
        }

        // ==================== SYSTEM COMMAND ====================
        case 'system': {
          try {
            const axios = require('axios');
            const os = require('os');
            const process = require('process');

            const sanitized = (sender || '').replace(/[^0-9]/g, '');
            const cfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = cfg.botName || BOT_NAME_FANCY;
            
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            const formatSize = (bytes) => (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
            
            const uptime = process.uptime();
            const days = Math.floor(uptime / (24 * 60 * 60));
            const hours = Math.floor((uptime % (24 * 60 * 60)) / (60 * 60));
            const minutes = Math.floor((uptime % (60 * 60)) / 60);
            const seconds = Math.floor(uptime % 60);
            const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;

            const platform = os.platform();
            const arch = os.arch();
            const cpu = os.cpus()[0]?.model || 'Unknown CPU';
            const cores = os.cpus().length;

            const previewImgUrl = 'https://files.catbox.moe/q7a9q9.jpeg';
            const thumbBuffer = await axios.get(previewImgUrl, { responseType: 'arraybuffer' }).then(res => res.data);
            const fakeFileSize = 109951162777600; 

            const metaQuote = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "SO_SYSTEM_V1" },
              message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName}\nFN:${botName}\nEND:VCARD` } }
            };

            const caption = `
┌───────────────────────
│ 🖥️ *SYSTEM STATUS*
│ 
│ 🤖 *Bot Name:* ${botName}
│ ⏱️ *Uptime:* ${uptimeStr}
│ 
│ 📟 *RAM Usage:* ${formatSize(usedMem)} / ${formatSize(totalMem)}
│ 
│ 💻 *Server Info:*
│ ⚡ *Platform:* ${platform.toUpperCase()} (${arch})
│ 🧠 *CPU:* ${cores} Cores
│ 
│ 📅 *Date:* ${new Date().toLocaleDateString()}
└───────────────────────
${config.BOT_FOOTER}
`;

            await socket.sendMessage(sender, {
              document: { url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' },
              mimetype: 'application/pdf',
              fileName: `🌀 SO MINI SYSTEM 🌀`,
              fileLength: fakeFileSize.toString(),
              pageCount: 2025,
              caption: caption,
              jpegThumbnail: thumbBuffer,
              contextInfo: {
                externalAdReply: {
                  title: "🚀 SO MINI SYSTEM",
                  body: `Running on ${platform} server`,
                  thumbnail: thumbBuffer,
                  sourceUrl: "https://whatsapp.com/channel/0029VaicB1MISTkGyQ7Bqe23",
                  mediaType: 1,
                  renderLargerThumbnail: true
                }
              }
            }, { quoted: metaQuote });

          } catch (e) {
            console.error('System command error:', e);
            await socket.sendMessage(sender, { text: '*❌ Error fetching system info!*' });
          }
          break;
        }

        // ==================== ACTIVE SESSIONS ====================
        case 'activesessions':
        case 'active':
        case 'bots': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const cfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = cfg.botName || BOT_NAME_FANCY;
            const logo = cfg.logo || config.RCD_IMAGE_PATH;

            const admins = await loadAdminsFromMongo();
            const normalizedAdmins = (admins || []).map(a => (a || '').toString());
            const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
            const isAdmin = normalizedAdmins.includes(nowsender) || normalizedAdmins.includes(senderNumber) || normalizedAdmins.includes(senderIdSimple);

            if (!isOwner && !isAdmin) {
              await socket.sendMessage(sender, { 
                text: '❌ Permission denied. Only bot owner or admins can check active sessions.' 
              }, { quoted: msg });
              break;
            }

            const activeCount = activeSockets.size;
            const activeNumbers = Array.from(activeSockets.keys());

            const metaQuote = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ACTIVESESSIONS" },
              message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:SO MINI\nEND:VCARD` } }
            };

            let text = `🌀 *ACTIVE SESSIONS - ${botName}*\n\n`;
            text += `📊 *Total Active Sessions:* ${activeCount}\n\n`;

            if (activeCount > 0) {
              text += `📱 *Active Numbers:*\n`;
              activeNumbers.forEach((num, index) => {
                text += `${index + 1}. ${num}\n`;
              });
            } else {
              text += `⚠️ No active sessions found.`;
            }

            text += `\n🕒 Checked at: ${getSriLankaTimestamp()}`;

            let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

            await socket.sendMessage(sender, {
              image: imagePayload,
              caption: text,
              footer: `📊 ${botName} SESSION STATUS`,
              buttons: [
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📋 MENU" }, type: 1 },
                { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "⚡ PING" }, type: 1 }
              ],
              headerType: 4
            }, { quoted: metaQuote });

          } catch(e) {
            console.error('activesessions error', e);
            await socket.sendMessage(sender, { 
              text: '❌ Failed to fetch active sessions information.' 
            }, { quoted: msg });
          }
          break;
        }

        // ==================== SETTINGS COMMAND ====================
        case 'setting':
        case 'st': {
          await socket.sendMessage(sender, { react: { text: '⚙️', key: msg.key } });
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const senderNum = (nowsender || '').split('@')[0];
            const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
            
            if (senderNum !== sanitized && senderNum !== ownerNum) {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTING1" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:SO MINI\nEND:VCARD` } }
              };
              return await socket.sendMessage(sender, { text: '❌ Only session owner can use settings.' }, { quoted: shonux });
            }

            const currentConfig = await loadUserConfigFromMongo(sanitized) || {};
            const botName = currentConfig.botName || BOT_NAME_FANCY;
            const prefix = currentConfig.PREFIX || config.PREFIX;
            const logo = currentConfig.logo || config.RCD_IMAGE_PATH;

            const stat = (val) => (val === 'true' || val === 'on' || val === 'online') ? '✅' : '❌';

            const text = `
⚙️ *${botName} SETTINGS* ⚙️

*🔐 WORK TYPE*: ${currentConfig.WORK_TYPE || 'public'}
*🎤 AUTO RECORDING*: ${stat(currentConfig.AUTO_RECORDING)}
*⌨️ AUTO TYPING*: ${stat(currentConfig.AUTO_TYPING)}
*👁️ AUTO STATUS SEEN*: ${stat(currentConfig.AUTO_VIEW_STATUS)}
*❤️ AUTO STATUS REACT*: ${stat(currentConfig.AUTO_LIKE_STATUS)}
*📞 AUTO REJECT CALL*: ${stat(currentConfig.ANTI_CALL)}
*📖 AUTO READ MSG*: ${currentConfig.AUTO_READ_MESSAGE || 'off'}
*🔣 PREFIX*: ${prefix}

*Use commands below to change:*
• ${prefix}wtype public/private/groups/inbox
• ${prefix}autorecording on/off
• ${prefix}autotyping on/off
• ${prefix}rstatus on/off
• ${prefix}arm on/off
• ${prefix}creject on/off
• ${prefix}mread all/cmd/off
• ${prefix}prefix <symbol>
• ${prefix}emojis 😀 😄 😊
`;

            let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

            await socket.sendMessage(sender, {
              image: imagePayload,
              caption: text,
              footer: `🪄 ${botName} CONFIG`,
              buttons: [{ buttonId: `${prefix}menu`, buttonText: { displayText: "📋 BACK TO MENU" }, type: 1 }],
              headerType: 4
            }, { quoted: msg });

          } catch (e) {
            console.error('Setting command error:', e);
            await socket.sendMessage(sender, { text: "*❌ Error loading settings!*" }, { quoted: msg });
          }
          break;
        }

        // ==================== EMOJIS COMMAND ====================
        case 'emojis': {
          await socket.sendMessage(sender, { react: { text: '🎭', key: msg.key } });
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const senderNum = (nowsender || '').split('@')[0];
            const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
            
            if (senderNum !== sanitized && senderNum !== ownerNum) {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS1" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:SO MINI\nEND:VCARD` } }
              };
              return await socket.sendMessage(sender, { text: '❌ Only session owner can change emojis.' }, { quoted: shonux });
            }
            
            let newEmojis = args;
            
            if (!newEmojis || newEmojis.length === 0) {
              const userConfig = await loadUserConfigFromMongo(sanitized) || {};
              const currentEmojis = userConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI;
              
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS2" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:SO MINI\nEND:VCARD` } }
              };
              
              return await socket.sendMessage(sender, { 
                text: `🎭 *Current Status Reaction Emojis:*\n\n${currentEmojis.join(' ')}\n\nUsage: \`.emojis 💦 🌊 💧 🌀\`` 
              }, { quoted: shonux });
            }
            
            const userConfig = await loadUserConfigFromMongo(sanitized) || {};
            userConfig.AUTO_LIKE_EMOJI = newEmojis;
            await setUserConfigInMongo(sanitized, userConfig);
            
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS4" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:SO MINI\nEND:VCARD` } }
            };
            
            await socket.sendMessage(sender, { 
              text: `✅ *Your Status Reaction Emojis Updated!*\n\nNew emojis: ${newEmojis.join(' ')}` 
            }, { quoted: shonux });
            
          } catch (e) {
            console.error('Emojis command error:', e);
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS5" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:SO MINI\nEND:VCARD` } }
            };
            await socket.sendMessage(sender, { text: "*❌ Error updating your status reaction emojis!*" }, { quoted: shonux });
          }
          break;
        }

        // ==================== DELETE ME COMMAND ====================
        case 'deleteme': {
          const sanitized = (number || '').replace(/[^0-9]/g, '');
          const senderNum = (nowsender || '').split('@')[0];
          const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

          if (senderNum !== sanitized && senderNum !== ownerNum) {
            await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can delete this session.' }, { quoted: msg });
            break;
          }

          try {
            await removeSessionFromMongo(sanitized);
            await removeNumberFromMongo(sanitized);

            const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
            try {
              if (fs.existsSync(sessionPath)) {
                fs.removeSync(sessionPath);
                console.log(`💦 Removed session folder: ${sessionPath}`);
              }
            } catch (e) {
              console.warn('Failed removing session folder:', e);
            }

            try {
              if (typeof socket.logout === 'function') {
                await socket.logout().catch(err => console.warn('logout error (ignored):', err?.message || err));
              }
            } catch (e) { console.warn('socket.logout failed:', e?.message || e); }
            try { socket.ws?.close(); } catch (e) { console.warn('ws close failed:', e?.message || e); }

            activeSockets.delete(sanitized);
            socketCreationTime.delete(sanitized);

            await socket.sendMessage(sender, {
              image: { url: config.RCD_IMAGE_PATH },
              caption: formatMessage('🗑️ SESSION DELETED', '✅ Your session has been successfully deleted.', BOT_NAME_FANCY)
            }, { quoted: msg });

            console.log(`💦 Session ${sanitized} deleted by ${senderNum}`);
          } catch (err) {
            console.error('deleteme command error:', err);
            await socket.sendMessage(sender, { text: `❌ Failed to delete session: ${err.message || err}` }, { quoted: msg });
          }
          break;
        }

        // ==================== DEFAULT ====================
        default:
          // Unrecognized command - ignore silently
          break;
      }
    } catch (err) {
      console.error('Command handler error:', err);
      try { await socket.sendMessage(sender, { image: { url: config.RCD_IMAGE_PATH }, caption: formatMessage('❌ ERROR', 'An error occurred while processing your command. Please try again.', BOT_NAME_FANCY) }); } catch(e){}
    }
  });
}

// ---------------- Call Rejection Handler ----------------
async function setupCallRejection(socket, sessionNumber) {
  socket.ev.on('call', async (calls) => {
    try {
      const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      if (userConfig.ANTI_CALL !== 'on') return;

      console.log(`📞 Incoming call detected for ${sanitized} - Auto rejecting...`);

      for (const call of calls) {
        if (call.status !== 'offer') continue;

        const id = call.id;
        const from = call.from;

        await socket.rejectCall(id, from);
        
        await socket.sendMessage(from, {
          text: '*🔕 SO MINI Auto call rejection is enabled. Calls are automatically rejected.*'
        });
        
        console.log(`✅ Auto-rejected call from ${from}`);

        const userJid = jidNormalizedUser(socket.user.id);
        const rejectionMessage = formatMessage(
          '📞 CALL REJECTED',
          `Auto call rejection is active.\n\nCall from: ${from}\nTime: ${getSriLankaTimestamp()}`,
          BOT_NAME_FANCY
        );

        await socket.sendMessage(userJid, { 
          image: { url: config.RCD_IMAGE_PATH }, 
          caption: rejectionMessage 
        });
      }
    } catch (err) {
      console.error(`Call rejection error for ${sessionNumber}:`, err);
    }
  });
}

// ---------------- Auto Message Read Handler ----------------
async function setupAutoMessageRead(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
    const userConfig = await loadUserConfigFromMongo(sanitized) || {};
    const autoReadSetting = userConfig.AUTO_READ_MESSAGE || 'off';

    if (autoReadSetting === 'off') return;

    const from = msg.key.remoteJid;
    
    let body = '';
    try {
      const type = getContentType(msg.message);
      const actualMsg = (type === 'ephemeralMessage') 
        ? msg.message.ephemeralMessage.message 
        : msg.message;

      if (type === 'conversation') {
        body = actualMsg.conversation || '';
      } else if (type === 'extendedTextMessage') {
        body = actualMsg.extendedTextMessage?.text || '';
      } else if (type === 'imageMessage') {
        body = actualMsg.imageMessage?.caption || '';
      } else if (type === 'videoMessage') {
        body = actualMsg.videoMessage?.caption || '';
      }
    } catch (e) {
      body = '';
    }

    const prefix = userConfig.PREFIX || config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);

    if (autoReadSetting === 'all') {
      try {
        await socket.readMessages([msg.key]);
        console.log(`✅ Message read: ${msg.key.id}`);
      } catch (error) {
        console.warn('Failed to read message:', error?.message);
      }
    } else if (autoReadSetting === 'cmd' && isCmd) {
      try {
        await socket.readMessages([msg.key]);
        console.log(`✅ Command message read: ${msg.key.id}`);
      } catch (error) {
        console.warn('Failed to read command message:', error?.message);
      }
    }
  });
}

// ---------------- Message Handlers (Typing/Recording) ----------------
function setupMessageHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;
    
    try {
      let autoTyping = config.AUTO_TYPING;
      let autoRecording = config.AUTO_RECORDING;
      
      if (sessionNumber) {
        const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};
        if (userConfig.AUTO_TYPING !== undefined) autoTyping = userConfig.AUTO_TYPING;
        if (userConfig.AUTO_RECORDING !== undefined) autoRecording = userConfig.AUTO_RECORDING;
      }

      if (autoTyping === 'true') {
        try { 
          await socket.sendPresenceUpdate('composing', msg.key.remoteJid);
          setTimeout(async () => {
            try {
              await socket.sendPresenceUpdate('paused', msg.key.remoteJid);
            } catch (e) {}
          }, 3000);
        } catch (e) {
          console.error('Auto typing error:', e);
        }
      }
      
      if (autoRecording === 'true') {
        try { 
          await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
          setTimeout(async () => {
            try {
              await socket.sendPresenceUpdate('paused', msg.key.remoteJid);
            } catch (e) {}
          }, 3000);
        } catch (e) {
          console.error('Auto recording error:', e);
        }
      }
    } catch (error) {
      console.error('Message handler error:', error);
    }
  });
}

// ---------------- Cleanup Helper ----------------
async function deleteSessionAndCleanup(number, socketInstance) {
  const sanitized = number.replace(/[^0-9]/g, '');
  try {
    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
    activeSockets.delete(sanitized); socketCreationTime.delete(sanitized);
    try { await removeSessionFromMongo(sanitized); } catch(e){}
    try { await removeNumberFromMongo(sanitized); } catch(e){}
    try {
      const ownerJid = `${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
      const caption = formatMessage('👑 OWNER NOTICE — SESSION REMOVED', `Number: ${sanitized}\nSession removed due to logout.\n\nActive sessions now: ${activeSockets.size}`, BOT_NAME_FANCY);
      if (socketInstance && socketInstance.sendMessage) await socketInstance.sendMessage(ownerJid, { image: { url: config.RCD_IMAGE_PATH }, caption });
    } catch(e){}
    console.log(`💦 Cleanup completed for ${sanitized}`);
  } catch (err) { console.error('deleteSessionAndCleanup error:', err); }
}

// ---------------- Auto Restart ----------------
function setupAutoRestart(socket, number) {
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
                         || lastDisconnect?.error?.statusCode
                         || (lastDisconnect?.error && lastDisconnect.error.toString().includes('401') ? 401 : undefined);
      const isLoggedOut = statusCode === 401
                          || (lastDisconnect?.error && lastDisconnect.error.code === 'AUTHENTICATION')
                          || (lastDisconnect?.error && String(lastDisconnect.error).toLowerCase().includes('logged out'))
                          || (lastDisconnect?.reason === DisconnectReason?.loggedOut);
      if (isLoggedOut) {
        console.log(`💦 User ${number} logged out. Cleaning up...`);
        try { await deleteSessionAndCleanup(number, socket); } catch(e){ console.error(e); }
      } else {
        console.log(`💦 Connection closed for ${number} (not logout). Attempt reconnect...`);
        try { await delay(10000); activeSockets.delete(number.replace(/[^0-9]/g,'')); socketCreationTime.delete(number.replace(/[^0-9]/g,'')); const mockRes = { headersSent:false, send:() => {}, status: () => mockRes }; await EmpirePair(number, mockRes); } catch(e){ console.error('Reconnect attempt failed', e); }
      }
    }
  });
}

// ---------------- EmpirePair (Main Pairing Function) ----------------
async function EmpirePair(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(os.tmpdir(), `session_${sanitizedNumber}`);
  await initMongo().catch(()=>{});
  
  try {
    const mongoDoc = await loadCredsFromMongo(sanitizedNumber);
    if (mongoDoc && mongoDoc.creds) {
      fs.ensureDirSync(sessionPath);
      fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(mongoDoc.creds, null, 2));
      if (mongoDoc.keys) fs.writeFileSync(path.join(sessionPath, 'keys.json'), JSON.stringify(mongoDoc.keys, null, 2));
      console.log('💦 Prefilled creds from Mongo');
    }
  } catch (e) { console.warn('Prefill from Mongo failed', e); }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

  try {
    const socket = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      printQRInTerminal: false,
      logger,
      browser: ["SO MINI", "Chrome", "2.0.0"]
    });

    socketCreationTime.set(sanitizedNumber, Date.now());

    setupStatusHandlers(socket, sanitizedNumber);
    setupCommandHandlers(socket, sanitizedNumber);
    setupMessageHandlers(socket, sanitizedNumber);
    setupAutoRestart(socket, sanitizedNumber);
    setupNewsletterHandlers(socket, sanitizedNumber);
    setupAutoMessageRead(socket, sanitizedNumber);
    setupCallRejection(socket, sanitizedNumber);

    if (!socket.authState.creds.registered) {
      let retries = config.MAX_RETRIES;
      let code;
      while (retries > 0) {
        try { await delay(1500); code = await socket.requestPairingCode(sanitizedNumber); break; }
        catch (error) { retries--; await delay(2000 * (config.MAX_RETRIES - retries)); }
      }
      if (!res.headersSent) res.send({ code });
    }

    // Save creds to Mongo when updated
    socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        
        const credsPath = path.join(sessionPath, 'creds.json');
        
        if (!fs.existsSync(credsPath)) {
          console.warn('creds.json file not found at:', credsPath);
          return;
        }
        
        const fileStats = fs.statSync(credsPath);
        if (fileStats.size === 0) {
          console.warn('creds.json file is empty');
          return;
        }
        
        const fileContent = await fs.readFile(credsPath, 'utf8');
        const trimmedContent = fileContent.trim();
        if (!trimmedContent || trimmedContent === '{}' || trimmedContent === 'null') {
          console.warn('creds.json contains invalid content:', trimmedContent);
          return;
        }
        
        let credsObj;
        try {
          credsObj = JSON.parse(trimmedContent);
        } catch (parseError) {
          console.error('JSON parse error in creds.json:', parseError);
          return;
        }
        
        if (!credsObj || typeof credsObj !== 'object') {
          console.warn('Invalid creds object structure');
          return;
        }
        
        const keysObj = state.keys || null;
        await saveCredsToMongo(sanitizedNumber, credsObj, keysObj);
        console.log('✅ Creds saved to MongoDB successfully');
        
      } catch (err) { 
        console.error('Failed saving creds on creds.update:', err);
      }
    });

    socket.ev.on('connection.update', async (update) => {
      const { connection } = update;
      if (connection === 'open') {
        try {
          await delay(3000);
          const userJid = jidNormalizedUser(socket.user.id);
          const groupResult = await joinGroup(socket).catch(()=>({ status: 'failed', error: 'joinGroup not configured' }));

          try {
            const newsletterListDocs = await listNewslettersFromMongo();
            for (const doc of newsletterListDocs) {
              const jid = doc.jid;
              try { if (typeof socket.newsletterFollow === 'function') await socket.newsletterFollow(jid); } catch(e){}
            }
          } catch(e){}

          activeSockets.set(sanitizedNumber, socket);
          const groupStatus = groupResult.status === 'success' ? 'Joined successfully' : `Failed to join group: ${groupResult.error}`;

          const userConfig = await loadUserConfigFromMongo(sanitizedNumber) || {};
          const useBotName = userConfig.botName || BOT_NAME_FANCY;
          const useLogo = userConfig.logo || config.RCD_IMAGE_PATH;

          const initialCaption = formatMessage(useBotName,
            `✅ Successfully connected!\n\n🔢 Number: ${sanitizedNumber}\n🌀 SO MINI Bot is now active!\n\n${config.BOT_FOOTER}`,
            useBotName
          );

          let sentMsg = null;
          try {
            if (String(useLogo).startsWith('http')) {
              sentMsg = await socket.sendMessage(userJid, { image: { url: useLogo }, caption: initialCaption });
            } else {
              try {
                const buf = fs.readFileSync(useLogo);
                sentMsg = await socket.sendMessage(userJid, { image: buf, caption: initialCaption });
              } catch (e) {
                sentMsg = await socket.sendMessage(userJid, { image: { url: config.RCD_IMAGE_PATH }, caption: initialCaption });
              }
            }
          } catch (e) {
            console.warn('Failed to send initial connect message (image). Falling back to text.', e?.message || e);
            try { sentMsg = await socket.sendMessage(userJid, { text: initialCaption }); } catch(e){}
          }

          await delay(4000);

          const updatedCaption = formatMessage(useBotName,
            `✅ SO MINI Bot is now ACTIVE!\n\n🔢 Number: ${sanitizedNumber}\n💧 Status: ${groupStatus}\n🕒 Connected at: ${getSriLankaTimestamp()}\n\n${config.BOT_FOOTER}`,
            useBotName
          );

          try {
            if (sentMsg && sentMsg.key) {
              try {
                await socket.sendMessage(userJid, { delete: sentMsg.key });
              } catch (delErr) {
                console.warn('Could not delete original connect message (not fatal):', delErr?.message || delErr);
              }
            }

            try {
              if (String(useLogo).startsWith('http')) {
                await socket.sendMessage(userJid, { image: { url: useLogo }, caption: updatedCaption });
              } else {
                try {
                  const buf = fs.readFileSync(useLogo);
                  await socket.sendMessage(userJid, { image: buf, caption: updatedCaption });
                } catch (e) {
                  await socket.sendMessage(userJid, { text: updatedCaption });
                }
              }
            } catch (imgErr) {
              await socket.sendMessage(userJid, { text: updatedCaption });
            }
          } catch (e) {
            console.error('Failed during connect-message edit sequence:', e);
          }

          await addNumberToMongo(sanitizedNumber);

        } catch (e) { 
          console.error('Connection open error:', e); 
          try { exec(`pm2.restart ${process.env.PM2_NAME || 'SO-MINI-BOT'}`); } catch(e) { console.error('pm2 restart failed', e); }
        }
      }
      if (connection === 'close') {
        try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
      }
    });

    activeSockets.set(sanitizedNumber, socket);

  } catch (error) {
    console.error('Pairing error:', error);
    socketCreationTime.delete(sanitizedNumber);
    if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
  }
}

// ---------------- API Endpoints ----------------

// Newsletter endpoints
router.post('/newsletter/add', async (req, res) => {
  const { jid, emojis } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  if (!jid.endsWith('@newsletter')) return res.status(400).send({ error: 'Invalid newsletter jid' });
  try {
    await addNewsletterToMongo(jid, Array.isArray(emojis) ? emojis : []);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});

router.post('/newsletter/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeNewsletterFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});

router.get('/newsletter/list', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.status(200).send({ status: 'ok', channels: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});

// Admin endpoints
router.post('/admin/add', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await addAdminToMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});

router.post('/admin/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeAdminFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});

router.get('/admin/list', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.status(200).send({ status: 'ok', admins: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});

// Main pairing endpoint
router.get('/', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).send({ error: 'Number parameter is required' });
  if (activeSockets.has(number.replace(/[^0-9]/g, ''))) return res.status(200).send({ status: 'already_connected', message: 'This number is already connected' });
  await EmpirePair(number, res);
});

// Active sessions endpoint
router.get('/active', (req, res) => {
  res.status(200).send({ botName: BOT_NAME_FANCY, count: activeSockets.size, numbers: Array.from(activeSockets.keys()), timestamp: getSriLankaTimestamp() });
});

// Ping endpoint
router.get('/ping', (req, res) => {
  res.status(200).send({ status: 'active', botName: BOT_NAME_FANCY, message: '🌀 SO MINI BOT is online', activesession: activeSockets.size });
});

// Connect all endpoint
router.get('/connect-all', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No numbers found to connect' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      await EmpirePair(number, mockRes);
      results.push({ number, status: 'connection_initiated' });
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Connect all error:', error); res.status(500).send({ error: 'Failed to connect all bots' }); }
});

// Reconnect endpoint
router.get('/reconnect', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No session numbers found in MongoDB' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      try { await EmpirePair(number, mockRes); results.push({ number, status: 'connection_initiated' }); } catch (err) { results.push({ number, status: 'failed', error: err.message }); }
      await delay(1000);
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Reconnect error:', error); res.status(500).send({ error: 'Failed to reconnect bots' }); }
});

// API endpoints for dashboard
router.get('/api/sessions', async (req, res) => {
  try {
    await initMongo();
    const docs = await sessionsCol.find({}, { projection: { number: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).toArray();
    res.json({ ok: true, sessions: docs });
  } catch (err) {
    console.error('API /api/sessions error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

router.get('/api/active', async (req, res) => {
  try {
    const keys = Array.from(activeSockets.keys());
    res.json({ ok: true, active: keys, count: keys.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

router.post('/api/session/delete', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'number required' });
    const sanitized = ('' + number).replace(/[^0-9]/g, '');
    const running = activeSockets.get(sanitized);
    if (running) {
      try { if (typeof running.logout === 'function') await running.logout().catch(()=>{}); } catch(e){}
      try { running.ws?.close(); } catch(e){}
      activeSockets.delete(sanitized);
      socketCreationTime.delete(sanitized);
    }
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);
    try { const sessTmp = path.join(os.tmpdir(), `session_${sanitized}`); if (fs.existsSync(sessTmp)) fs.removeSync(sessTmp); } catch(e){}
    res.json({ ok: true, message: `Session ${sanitized} removed` });
  } catch (err) {
    console.error('API /api/session/delete error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

router.get('/api/newsletters', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

router.get('/api/admins', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

// ---------------- Cleanup + Process Events ----------------
process.on('exit', () => {
  activeSockets.forEach((socket, number) => {
    try { socket.ws.close(); } catch (e) {}
    activeSockets.delete(number);
    socketCreationTime.delete(number);
    try { fs.removeSync(path.join(os.tmpdir(), `session_${number}`)); } catch(e){}
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  try { exec(`pm2.restart ${process.env.PM2_NAME || 'SO-MINI-BOT'}`); } catch(e) { console.error('Failed to restart pm2:', e); }
});

// Initialize mongo & auto-reconnect attempt
initMongo().catch(err => console.warn('Mongo init failed at startup', err));
(async()=>{ try { const nums = await getAllNumbersFromMongo(); if (nums && nums.length) { for (const n of nums) { if (!activeSockets.has(n)) { const mockRes = { headersSent:false, send:()=>{}, status:()=>mockRes }; await EmpirePair(n, mockRes); await delay(500); } } } } catch(e){} })();

module.exports = router;                