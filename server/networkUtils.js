import os from 'node:os';

/**
 * Discovers non-internal IPv4 LAN addresses of the host machine
 * @returns {Array<{ name: string, address: string, internal: boolean }>}
 */
export function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const results = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      // Look for IPv4 and non-internal addresses
      if (addr.family === 'IPv4' && !addr.internal) {
        results.push({
          name,
          address: addr.address,
          internal: false,
        });
      }
    }
  }

  // If no external interface found, fallback to localhost
  if (results.length === 0) {
    results.push({
      name: 'Loopback',
      address: '127.0.0.1',
      internal: true,
    });
  }

  return results;
}

/**
 * Gets the primary LAN IP address
 * Prefers typical Wi-Fi or Ethernet addresses (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
 * @returns {string}
 */
export function getPrimaryLanIp() {
  const ips = getLocalIpAddresses();
  // Filter for common private subnet patterns
  const prioritized = ips.find((ip) => {
    return (
      ip.address.startsWith('192.168.') ||
      ip.address.startsWith('10.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip.address)
    );
  });

  return prioritized ? prioritized.address : ips[0].address;
}
