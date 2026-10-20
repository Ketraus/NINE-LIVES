// Configuração compartilhada do multiplayer por salas (menu, lista de salas,
// MultiplayerManager). Um único lugar pros limites e tópicos.

export const MAX_ROOM_PLAYERS = 4; // limite da sala
export const MIN_PLAYERS_TO_START = 2; // mínimo pra liberar o "pronto"
export const DEFAULT_BROKER_URL = 'wss://ninelives.feira-de-jogos.dev.br/mqtt';

// Cada sala "anuncia" que existe publicando um batimento neste tópico
// (quem anuncia é o Host atual). Sem retain: se o Host some, os batimentos
// param e a sala desaparece da lista sozinha depois do TTL.
export const LOBBY_TOPIC_PREFIX = 'nine-lives/lobby/rooms';
export const ROOM_ADVERT_INTERVAL_MS = 1500;
export const ROOM_ADVERT_TTL_MS = 5000;

export const ROOM_PASSWORD_MIN = 3;
export const ROOM_PASSWORD_MAX = 16;

// sem 0/O/1/I pra não confundir na hora de ler o código
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(length = 5) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function getBrokerUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('mqttUrl') || DEFAULT_BROKER_URL;
}

// Hash simples (cyrb53) salgado com o código da sala. É uma trava casual de
// "partida privada" — não é segurança de verdade (o broker é aberto).
export function hashRoomPassword(room, password) {
  const text = `nl:${room}:${password}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
