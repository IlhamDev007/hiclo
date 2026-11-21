// Canvas artwork and character choreography. Uploads never enter this module's
// character-effects paths; their only motion comes from the shared rope model.
(() => {
  const hooks = new Map();
  function paintHook(ctx, x, type) {
    ctx.save(); ctx.translate(x, 0);
    const gold = type === 'royal';
    const metal = ctx.createLinearGradient(-18, 0, 18, 0);
    for (const [offset, color] of [[0,gold?'#755021':'#34414a'],[.3,gold?'#f0cf81':'#dce7ef'],[.55,gold?'#aa7e35':'#7c91a0'],[.8,gold?'#fff0b2':'#f3f8fc'],[1,gold?'#73501f':'#485761']]) metal.addColorStop(offset,color);
    ctx.fillStyle = metal; ctx.strokeStyle = '#1f2b35'; ctx.lineWidth = .7;
    ctx.shadowColor = '#0005'; ctx.shadowBlur = 2; ctx.shadowOffsetY = 1;
    ctx.beginPath();
    if (type === 'forged') { ctx.moveTo(-19,0);ctx.lineTo(19,0);ctx.lineTo(15,8);ctx.lineTo(-15,8);ctx.closePath(); }
    else if (type === 'royal') ctx.ellipse(0,1,18,5,0,0,Math.PI*2);
    else if (type === 'eye') { ctx.moveTo(-11,0);ctx.lineTo(11,0);ctx.lineTo(14,5);ctx.lineTo(8,9);ctx.lineTo(-8,9);ctx.lineTo(-14,5);ctx.closePath(); }
    else ctx.roundRect(-18,-1,36,7,[0,0,3,3]);
    ctx.fill();ctx.stroke();ctx.shadowBlur=0;
    ctx.strokeStyle=metal;ctx.lineWidth=3.5;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();
    if(type==='eye') { ctx.moveTo(0,7);ctx.lineTo(0,13);ctx.stroke();ctx.beginPath();ctx.arc(0,21,8,0,Math.PI*2); }
    else if(type==='forged') { ctx.moveTo(-7,8);ctx.lineTo(-7,24);ctx.lineTo(0,30);ctx.lineTo(7,24);ctx.lineTo(7,8);ctx.closePath(); }
    else if(type==='royal') { ctx.moveTo(0,6);ctx.lineTo(9,18);ctx.lineTo(0,28);ctx.lineTo(-9,18);ctx.closePath(); }
    else { ctx.moveTo(-3,5);ctx.lineTo(-3,18);ctx.bezierCurveTo(-3,28,8,29,8,18); }
    ctx.stroke();
    ctx.strokeStyle=gold?'#fff0b0':'#f3faff';ctx.lineWidth=.7;ctx.beginPath();
    if(type==='eye'){ctx.arc(0,21,6.8,Math.PI*.6,Math.PI*1.6);ctx.strokeStyle='#516270';for(let y=8;y<13;y+=2){ctx.moveTo(-3,y);ctx.lineTo(3,y-1);}}
    else{ctx.moveTo(-4,10);ctx.lineTo(type==='royal'?-7:-4,type==='forged'?24:20);}
    ctx.stroke();
    if(type==='royal'){ctx.fillStyle='#bc83cb';ctx.beginPath();ctx.arc(0,10,2,0,Math.PI*2);ctx.fill();}
    if(type==='steel'){ctx.strokeStyle=metal;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,26,2,0,Math.PI*2);ctx.stroke();}
    ctx.restore();
  }
  function hook(ctx, x, type) {
    const scale = ctx.getTransform().a;
    const key = `${type}:${scale}`;
    if (!hooks.has(key)) {
      const stamp = new OffscreenCanvas(Math.ceil(48 * scale), Math.ceil(38 * scale));
      const painter = stamp.getContext('2d');
      painter.setTransform(scale, 0, 0, scale, 0, 0);
      paintHook(painter, 24, type);
      hooks.set(key, stamp);
    }
    const stamp = hooks.get(key);
    ctx.drawImage(stamp, x - 24, 0, stamp.width / scale, stamp.height / scale);
  }
  function rope(ctx, item, anchor, bob, length, width) {
    const distance = Math.hypot(bob.x - anchor.x, bob.y - anchor.y);
    const slack = Math.sqrt(Math.max(0, length * length - distance * distance)) * .6;
    const bend = anchor.x < width / 2 ? 1 : -1;
    const controlX = x => Math.max(0, Math.min(width, x + bend * slack * 1.25));
    const first = { x: controlX(anchor.x), y: anchor.y + (bob.y - anchor.y) * .4 + slack * .65 };
    const second = { x: controlX(bob.x), y: anchor.y + (bob.y - anchor.y) * .8 + slack * .5 };
    if (item.rope !== 'none') {
      const trace = new Path2D();
      trace.moveTo(anchor.x, anchor.y);
      if (slack > 1) trace.bezierCurveTo(first.x, first.y, second.x, second.y, bob.x, bob.y);
      else trace.lineTo(bob.x, bob.y);
      ctx.save(); ctx.globalAlpha = item.opacity / 100;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#17212b65'; ctx.lineWidth = item.thickness + 1.5; ctx.stroke(trace);
      ctx.strokeStyle = item.color; ctx.lineWidth = item.thickness;
      ctx.setLineDash(item.rope === 'chain' ? [4, 2] : []); ctx.stroke(trace);
      if (item.rope === 'chain' || item.rope === 'braid') {
        ctx.strokeStyle = '#ffffffa0'; ctx.lineWidth = Math.max(.6, item.thickness * .35);
        ctx.setLineDash(item.rope === 'chain' ? [1, 5] : [2, 3]); ctx.stroke(trace);
      }
      ctx.restore();
    }
    hook(ctx, anchor.x, item.hook);
    return { anchor, bob, slack, first, second };
  }
  function bolt(ctx, x, y, ex, ey, seed, strength) {
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let i = 1; i <= 7; i++) {
      const f = i / 7, jitter = Math.sin(seed * 11 + i * 9) * Math.sin(f * Math.PI) * 13;
      ctx.lineTo(x + (ex - x) * f + jitter, y + (ey - y) * f);
    }
    ctx.strokeStyle = `rgba(100,190,255,${strength})`; ctx.lineWidth = 3;
    ctx.shadowColor = '#59b7ff'; ctx.shadowBlur = 9; ctx.stroke();
    ctx.strokeStyle = `rgba(228,248,255,${strength})`; ctx.lineWidth = 1; ctx.stroke();
  }
  function effects(ctx, entry, path, time, angle, size) {
    const { item } = entry, { anchor, bob, slack, first, second } = path, s = size;
    const t = time / 1000, age = time - entry.actionAt;
    ctx.save(); ctx.translate(bob.x, bob.y); ctx.rotate(angle); ctx.scale(item.flip ? -1 : 1, 1);
    ctx.globalAlpha = item.opacity / 100;
    if (item.asset === 'hammer') {
      const pulse = .25 + .15 * Math.sin(t * 4);
      const glow = ctx.createRadialGradient(0, s * .8, 2, 0, s * .8, s * .7);
      glow.addColorStop(0, `rgba(84,181,255,${pulse})`); glow.addColorStop(1, '#60c0ff00');
      ctx.fillStyle = glow; ctx.fillRect(-s, 0, s * 2, s * 1.7);
      const burst = age < 900, phase = Math.floor(time / 140);
      for (let i = 0; i < (burst ? 4 : 2); i++) {
        const theta = phase * 1.4 + i * 2.1;
        bolt(ctx, Math.cos(theta) * s * .15, s * .8, Math.cos(theta) * s * (burst ? .9 : .5), s * .8 + Math.sin(theta) * s * .55, phase + i, burst ? .9 : .4);
      }
      if (burst) {
        bolt(ctx, 0, s * .8, 12 * Math.sin(age / 100), s * 1.55, phase + 6, 1 - age / 900);
        ctx.shadowBlur = 0; ctx.strokeStyle = `rgba(120,210,255,${.7 * (1 - age / 900)})`;
        ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, s * 1.55, age / 18, 5 + age / 160, 0, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (item.asset === 'princess') {
      for (let i = 0; i < 14; i++) {
        const phase = t * .4 + i * 2.4, x = Math.sin(phase) * s * .65, y = (i / 14 + t * .12) % 1 * s * 1.2;
        const alpha = .25 + .5 * Math.pow(Math.sin(t * 2 + i), 2);
        ctx.strokeStyle = `rgba(239,208,152,${alpha})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - 2.5, y); ctx.lineTo(x + 2.5, y); ctx.moveTo(x, y - 2.5); ctx.lineTo(x, y + 2.5); ctx.stroke();
      }
      ctx.strokeStyle = '#dac2f445'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, s * .8, s * .6, s * .12, Math.sin(t) * .2, 0, Math.PI * 2); ctx.stroke();
    } else if (item.asset === 'spider-man') {
      // Spider sense radiates around the upside-down head. Slow ambient pulses
      // and a stronger interaction burst remain local to the figure.
      const burst = age < 1100 ? Math.sin(Math.PI * age / 1100) : 0;
      const pulse = .22 + .18 * (1 + Math.sin(t * 2.4)) / 2 + burst * .4;
      const hx = -s * .12, hy = s * .83;
      ctx.shadowColor = '#ff6b4f'; ctx.shadowBlur = 5;
      for (let i = 0; i < 11; i++) {
        const angle = Math.PI * (.05 + i * .18), inner = s * .24, outer = inner + s * (.07 + burst * .1);
        const x = hx + Math.cos(angle) * inner, y = hy + Math.sin(angle) * inner;
        ctx.strokeStyle = 'rgba(255,100,72,' + pulse + ')'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x,y);
        ctx.lineTo(hx+Math.cos(angle+.06)*(inner+outer)/2,hy+Math.sin(angle+.06)*(inner+outer)/2);
        ctx.lineTo(hx+Math.cos(angle)*outer,hy+Math.sin(angle)*outer); ctx.stroke();
      }
      ctx.shadowBlur = 0;

      ctx.strokeStyle = '#deefff95'; ctx.lineWidth = .7;
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, -8); ctx.quadraticCurveTo(side * s * .09, -3, side * s * .07, s * .08); ctx.stroke(); }
    }
    ctx.restore();
    if (item.asset === 'spider-man' && item.rope !== 'none') {
      const f = (t * .3) % 1, u = 1 - f;
      const at = key => slack > 1
        ? u ** 3 * anchor[key] + 3 * u * u * f * first[key] + 3 * u * f * f * second[key] + f ** 3 * bob[key]
        : u * anchor[key] + f * bob[key];
      ctx.save(); ctx.fillStyle = '#e5f5ffb0'; ctx.shadowBlur = 6; ctx.shadowColor = '#a1d7ff';
      ctx.beginPath(); ctx.arc(at('x'), at('y'), 1.6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  globalThis.StillJoyArt = Object.freeze({ hook, rope, effects });
})();
