// Prova vinculada ao jogador e à autoridade atual: o segredo da sala nunca
// vai no anúncio ou no heartbeat. Não substitui ACL/autenticação no broker.
export async function createRoomProof(secret, room, playerId, epoch, term, isHost) {
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await globalThis.crypto.subtle.sign(
    'HMAC', key, encoder.encode(JSON.stringify([room, playerId, epoch, term, isHost]))
  );
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
