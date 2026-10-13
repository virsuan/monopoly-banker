// Мультяшные фишки. mood: 'ok' | 'happy' | 'sad'

function faceSVG(x1, x2, ey, my, mood, er = 6) {
  const pr = er * 0.55;
  const look = mood === 'sad' ? 1.5 : 0;
  let eyes;
  if (mood === 'happy') {
    eyes = `<path d="M${x1 - er} ${ey + 1} Q${x1} ${ey - er * 1.3} ${x1 + er} ${ey + 1}" stroke="#2b1d1d" stroke-width="3" fill="none" stroke-linecap="round"/>
            <path d="M${x2 - er} ${ey + 1} Q${x2} ${ey - er * 1.3} ${x2 + er} ${ey + 1}" stroke="#2b1d1d" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  } else {
    eyes = `<circle cx="${x1}" cy="${ey}" r="${er}" fill="#fff"/><circle cx="${x2}" cy="${ey}" r="${er}" fill="#fff"/>
            <circle cx="${x1}" cy="${ey + look}" r="${pr}" fill="#2b1d1d"/><circle cx="${x2}" cy="${ey + look}" r="${pr}" fill="#2b1d1d"/>
            <circle cx="${x1 + pr * 0.4}" cy="${ey - pr * 0.5 + look}" r="${pr * 0.35}" fill="#fff"/><circle cx="${x2 + pr * 0.4}" cy="${ey - pr * 0.5 + look}" r="${pr * 0.35}" fill="#fff"/>`;
  }
  const brows = mood === 'sad'
    ? `<path d="M${x1 - er} ${ey - er - 3} L${x1 + er} ${ey - er - 6}" stroke="#2b1d1d" stroke-width="2.5" stroke-linecap="round"/>
       <path d="M${x2 - er} ${ey - er - 6} L${x2 + er} ${ey - er - 3}" stroke="#2b1d1d" stroke-width="2.5" stroke-linecap="round"/>`
    : '';
  const w = (x2 - x1) * 0.45;
  const mx = (x1 + x2) / 2;
  let mouth;
  if (mood === 'happy') {
    mouth = `<path d="M${mx - w} ${my - 2} Q${mx} ${my + 12} ${mx + w} ${my - 2} Z" fill="#7a1f2b"/>
             <path d="M${mx - w * 0.5} ${my + 4} Q${mx} ${my + 9} ${mx + w * 0.5} ${my + 4}" fill="#ff8a9a"/>`;
  } else if (mood === 'sad') {
    mouth = `<path d="M${mx - w * 0.8} ${my + 5} Q${mx} ${my - 4} ${mx + w * 0.8} ${my + 5}" stroke="#2b1d1d" stroke-width="3" fill="none" stroke-linecap="round"/>
             <path d="M${x2 + er * 0.6} ${ey + er} q-3 6 0 9 q3 -3 0 -9z" fill="#7fd0ff"/>`;
  } else {
    mouth = `<path d="M${mx - w * 0.7} ${my} Q${mx} ${my + 6} ${mx + w * 0.7} ${my}" stroke="#2b1d1d" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  }
  const cheeks = `<ellipse cx="${x1 - er * 0.9}" cy="${my}" rx="${er * 0.8}" ry="${er * 0.5}" fill="#ff7f9c" opacity=".55"/>
                  <ellipse cx="${x2 + er * 0.9}" cy="${my}" rx="${er * 0.8}" ry="${er * 0.5}" fill="#ff7f9c" opacity=".55"/>`;
  return cheeks + eyes + brows + mouth;
}

function tokenSVG(kind, mood = 'ok') {
  const c = TOKENS[kind].color;
  let body = '';
  switch (kind) {
    case 'heart':
      body = `<path d="M50 90 C18 68 6 50 12 32 C18 14 42 12 50 30 C58 12 82 14 88 32 C94 50 82 68 50 90Z" fill="${c}" stroke="#b5244a" stroke-width="3"/>
              <ellipse cx="28" cy="30" rx="7" ry="4" fill="#fff" opacity=".45" transform="rotate(-35 28 30)"/>
              ${faceSVG(39, 61, 46, 60, mood, 6.5)}`;
      break;
    case 'car':
      body = `<path d="M26 44 L34 22 Q36 18 41 18 L63 18 Q68 18 70 22 L78 44Z" fill="${c}" stroke="#1d4f9a" stroke-width="3"/>
              <path d="M33 42 L39 25 L61 25 L67 42Z" fill="#d9f1ff"/>
              <rect x="6" y="40" width="88" height="32" rx="12" fill="${c}" stroke="#1d4f9a" stroke-width="3"/>
              <circle cx="14" cy="54" r="5" fill="#ffe680"/><circle cx="86" cy="54" r="5" fill="#ffe680"/>
              <circle cx="28" cy="74" r="11" fill="#333"/><circle cx="28" cy="74" r="4.5" fill="#bbb"/>
              <circle cx="72" cy="74" r="11" fill="#333"/><circle cx="72" cy="74" r="4.5" fill="#bbb"/>
              ${faceSVG(42, 58, 33, 58, mood, 5.5)}`;
      break;
    case 'ship':
      body = `<rect x="56" y="12" width="12" height="22" rx="2" fill="#e3262f" stroke="#9c1a20" stroke-width="2"/>
              <rect x="56" y="17" width="12" height="4" fill="#fff"/>
              <rect x="28" y="30" width="46" height="24" rx="5" fill="#fff" stroke="#0b6f6f" stroke-width="3"/>
              <circle cx="38" cy="42" r="4" fill="#9fe2e2" stroke="#0b6f6f" stroke-width="2"/>
              <circle cx="51" cy="42" r="4" fill="#9fe2e2" stroke="#0b6f6f" stroke-width="2"/>
              <circle cx="64" cy="42" r="4" fill="#9fe2e2" stroke="#0b6f6f" stroke-width="2"/>
              <path d="M6 52 L94 52 L80 82 Q50 88 20 82Z" fill="${c}" stroke="#0b6f6f" stroke-width="3"/>
              <path d="M2 88 q8 -6 16 0 t16 0 t16 0 t16 0 t16 0 t16 0" stroke="#4fb8f0" stroke-width="4" fill="none" stroke-linecap="round"/>
              ${faceSVG(40, 60, 62, 72, mood, 5.5)}`;
      break;
    case 'hat':
      body = `<ellipse cx="50" cy="76" rx="44" ry="11" fill="#3a2a66" stroke="#231845" stroke-width="3"/>
              <path d="M26 72 L28 18 Q50 10 72 18 L74 72 Q50 80 26 72Z" fill="${c}" stroke="#4b2f99" stroke-width="3"/>
              <path d="M27 58 Q50 66 73 58 L73.6 68 Q50 76 26.6 68Z" fill="#ffcf3f"/>
              <ellipse cx="38" cy="24" rx="5" ry="3" fill="#fff" opacity=".35"/>
              ${faceSVG(41, 59, 34, 47, mood, 6)}`;
      break;
  }
  return `<svg class="token-svg" viewBox="0 0 100 100" aria-hidden="true">${body}</svg>`;
}
