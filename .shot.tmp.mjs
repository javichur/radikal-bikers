import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1000, height: 600 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await p.goto('http://127.0.0.1:4173/?e2e');
for (let i=0;i<3;i++){ await p.keyboard.press('Enter'); await p.waitForTimeout(400);}
await p.waitForFunction(() => document.querySelector('#app').dataset.screen==='racing', null, {timeout: 30000});
const places = JSON.parse(process.argv[2] || '[]');
for (const [name, route, s, d, mode] of places) {
  await p.evaluate(([route,s,d,mode]) => {
    const g = window.__RR__.game; const w = g.currentWorld;
    w.bike.route = route; w.bike.s = s * w.currentTrack.length; w.bike.s = s * w.trackOf(route).length; w.bike.d = d; w.bike.yaw = 0; w.bike.speed = 0; w.bike.height = 0;
    g.renderer.mode = mode;
    if (mode==='showcase') { g.renderer.render(0.016); }
  }, [route,s,d,mode]);
  await p.waitForTimeout(700);
  await p.screenshot({ path: `/tmp/shots/${name}.png` });
}
console.log(JSON.stringify(errs));
await b.close();
