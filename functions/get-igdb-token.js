const fetch = require('node-fetch');

let tokenCache = {
  value: null,
  expires: 0,
};

exports.handler = async () => {
  const now = Date.now();

  if (tokenCache.value && now < tokenCache.expires) {
    return {
      statusCode: 200,
      body: JSON.stringify({ token: tokenCache.value }),
    };
  }

  const res = await fetch(`https://id.twitch.tv/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });

  const data = await res.json();

  tokenCache.value = data.access_token;
  tokenCache.expires = now + data.expires_in * 1000 - 60_000; // 1 min buffer

  return {
    statusCode: 200,
    body: JSON.stringify({ token: tokenCache.value }),
  };
};
