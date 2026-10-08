// SHA-256 fingerprints of words and two-word phrases this public repo must
// never contain. See public-guard.ts. To add one:
//   node -e "console.log(require('node:crypto').createHash('sha256').update('some phrase').digest('hex'))"
// (lowercase, one space between words), then add the hash here.
export const DENIED: readonly string[] = [
  '06b9a6eacd7a77b9361123fd19776455eb16b9c83426a1abbf514a414792b73f',
  '2a09783b1c474294d122b82b93b01c3701bc9e4d65b3ae60da211a4121152a43',
  '2c3827a002d7a48cd3ad594495f7a3c218094f2a58a81d39c9e513531e914ad5',
  '3ca5b7bd023b4a1082e25f3f58ccd4a7928f076f2e25e1435963fecf34e79233',
  'cd696078b6f85be6b739159d37c750e13f49442cce09bb8ffea07cb9361f382a',
  '4e47b365c4d1de329ce96ac4dfa85b2fb31bf681cf9a8b811b3eaae54fd28514',
  '5b7f832dd957f6b32686aabfe51835b4036b145f71b1aef238955344a9b867cb',
  '62b07c5cb6bcbae8b7f2685c6ab4ab6be212ef3e95c55597a26f3732abe6251d',
  '6f6076f758d62b52cfdafa4d20997f6aa9e7d3182dae4c7ba8f2d891ef933182',
  '9338e331d479c96be7ba16012ed12c8ceef8c6cea417c95ea7fdab02ef3af250',
  'af06b59641fc3c75d982226c8eb69e108b5813869dd4f0e38b249649e4aa5d98',
  'e12d6611d6771b5bc857fc1e6111c076832f2004e803531b380b1eb77d9f445d',
  'fc613b4dfd6736a7bd268c8a0e74ed0d1c04a959f59dd74ef2874983fd443fc9',
];
