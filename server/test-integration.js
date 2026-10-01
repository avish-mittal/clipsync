import { WebSocket } from 'ws';
import fs from 'node:fs';

async function runTests() {
  console.log('--- 1. Testing /api/v1/info ---');
  const infoRes = await fetch('http://localhost:4040/api/v1/info');
  const info = await infoRes.json();
  console.log('Server info:', info);
  if (!info.primaryIp) throw new Error('primaryIp missing');

  console.log('\n--- 2. Testing /api/v1/qr ---');
  const qrRes = await fetch('http://localhost:4040/api/v1/qr?format=svg');
  const qrSvg = await qrRes.text();
  console.log('QR SVG length:', qrSvg.length, 'starts with <svg:', qrSvg.startsWith('<svg'));
  if (!qrSvg.includes('<svg')) throw new Error('Invalid QR SVG');

  console.log('\n--- 3. Testing WebSocket Connection ---');
  const ws1 = new WebSocket('ws://localhost:4040/ws');
  const ws2 = new WebSocket('ws://localhost:4040/ws');

  await new Promise((resolve) => ws1.on('open', resolve));
  await new Promise((resolve) => ws2.on('open', resolve));
  console.log('WS1 and WS2 connected!');

  const ws2Received = [];
  ws2.on('message', (data) => {
    const parsed = JSON.parse(data.toString());
    ws2Received.push(parsed);
  });

  // Client 1 registers
  ws1.send(JSON.stringify({
    event: 'sync:register',
    data: { name: 'MacBook Pro', type: 'desktop', os: 'macOS' }
  }));

  // Client 2 registers
  ws2.send(JSON.stringify({
    event: 'sync:register',
    data: { name: 'iPhone 15', type: 'mobile', os: 'iOS' }
  }));

  await new Promise((r) => setTimeout(r, 200));

  console.log('\n--- 4. Testing sync:new_item broadcast ---');
  ws1.send(JSON.stringify({
    event: 'sync:new_item',
    data: {
      type: 'CODE',
      content: 'const greet = () => "Hello ClipSync!";\nconsole.log(greet());',
      metadata: { lines: 2 }
    }
  }));

  await new Promise((r) => setTimeout(r, 200));

  const broadcastedItem = ws2Received.find((m) => m.event === 'sync:new_item');
  console.log('WS2 received broadcasted item:', broadcastedItem?.data?.content);
  if (!broadcastedItem) throw new Error('sync:new_item not broadcasted');

  console.log('\n--- 5. Testing File Upload via multipart /api/v1/upload ---');
  const testBuffer = Buffer.from('ClipSync test file content 12345');
  const formData = new FormData();
  const blob = new Blob([testBuffer], { type: 'text/plain' });
  formData.append('file', blob, 'sample.txt');
  formData.append('senderName', 'Test Runner');
  formData.append('senderType', 'desktop');
  formData.append('senderOs', 'Windows');

  const uploadRes = await fetch('http://localhost:4040/api/v1/upload', {
    method: 'POST',
    body: formData,
  });
  const uploadJson = await uploadRes.json();
  console.log('Upload response:', uploadJson);
  if (!uploadJson.success) throw new Error('Upload failed');

  console.log('\n--- 6. Testing File Download ---');
  const downloadRes = await fetch(`http://localhost:4040${uploadJson.item.metadata.url}`);
  const downloadedText = await downloadRes.text();
  console.log('Downloaded content:', downloadedText);
  if (downloadedText !== 'ClipSync test file content 12345') throw new Error('Content mismatch');

  console.log('\n--- 7. Testing sync:delete ---');
  ws1.send(JSON.stringify({
    event: 'sync:delete',
    data: { id: uploadJson.item.id }
  }));

  await new Promise((r) => setTimeout(r, 200));

  const historyRes = await fetch('http://localhost:4040/api/v1/history');
  const historyJson = await historyRes.json();
  console.log('History item count after deletion:', historyJson.items.length);

  ws1.close();
  ws2.close();

  console.log('\n ALL TESTS PASSED SUCCESSFULLY! ');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
