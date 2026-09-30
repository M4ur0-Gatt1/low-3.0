const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
global.window=global;
for(const file of ['core/history','animation/palette','animation/scene-model','rigging/binding','animation/exposures','animation/document','animation/rhythm-lab'])vm.runInThisContext(fs.readFileSync(path.join(__dirname,'../ui',file+'.js'),'utf8'));
const A=LOW.animation,R=A.rhythm;
let count=0;function test(name,fn){fn();count++;console.log('OK '+name);}
function fixture(){const d=new A.LowDoc();d.setHistory(new LOW.core.HistoryManager());d.level.addDrawing(1,'<path id="one"/>');d.level.addDrawing(2,'<path id="two"/>');d.layer.cells=[1,1,null,2,2,2,null,null];return d;}
test('capture and audition leave the document untouched',()=>{const d=fixture(),before=JSON.stringify(d.scene.toJSON()),s=R.capture(d);assert.deepEqual(s.original,[2,1,3]);R.cellsFor(s,[3,1,2]);assert.equal(JSON.stringify(d.scene.toJSON()),before);assert.equal(d.history.undoStack.length,0);});
test('fixed duration conserves every frame for uneven weights',()=>{for(let n=2;n<30;n++)for(let budget=n;budget<180;budget++){const a=R.fit(Array.from({length:n},(_,i)=>(i+1)*1.13),budget);assert.equal(R.total(a),budget);assert(a.every(v=>Number.isInteger(v)&&v>=1));}});
test('one Undo restores all cells including empty tail; Redo and reopen retain result',()=>{const d=fixture(),before=d.layer.cells.slice(),s=R.capture(d);assert(R.apply(d,s,[3,1,2]));assert.deepEqual(d.layer.cells,[1,1,1,null,2,2,null,null]);assert.equal(d.history.undoStack.length,1);const after=d.layer.cells.slice();d.history.undo();assert.deepEqual(d.layer.cells,before);d.history.redo();assert.deepEqual(d.layer.cells,after);const reopened=A.LowDoc.fromJSON(JSON.parse(JSON.stringify(d.toJSON())));assert.deepEqual(reopened.layer.cells,after);});
test('same rhythm is a no-op',()=>{const d=fixture();assert.equal(R.apply(d,R.capture(d),[2,1,3]),false);assert.equal(d.history.undoStack.length,0);});
test('stale drawings or cells and locked layers cannot be overwritten',()=>{for(const mutation of [d=>d.layer.cells[0]=2,d=>d.level.byNumber(1).content='<circle/>',d=>d.layer.locked=true,d=>d.scene.fps=12]){const d=fixture(),s=R.capture(d);mutation(d);const before=JSON.stringify(d.scene.toJSON());assert.throws(()=>R.apply(d,s,[3,1,2]));assert.equal(JSON.stringify(d.scene.toJSON()),before);}});
test('invalid duration never partially changes the scene',()=>{for(const bad of [[0,1,2],[NaN,1,2],[Infinity,1,2],[2.5,1,2],[12000,1,2],[1,2]]){const d=fixture(),s=R.capture(d),before=JSON.stringify(d.scene.toJSON());assert.throws(()=>R.apply(d,s,bad));assert.equal(JSON.stringify(d.scene.toJSON()),before);}});
test('unrelated layers and drawings stay identical',()=>{const d=fixture(),s=R.capture(d),other=d.addLayer('Other');other.cells=[1,1,1];const saved=JSON.stringify(d.scene.levels.map(l=>l.toJSON())),cells=other.cells.slice();R.apply(d,s,[3,1,2]);assert.deepEqual(other.cells,cells);assert.equal(JSON.stringify(d.scene.levels.map(l=>l.toJSON())),saved);});
test('sampling honors frame boundaries and last pose',()=>{assert.equal(R.at([2,3],0),0);assert.equal(R.at([2,3],1),0);assert.equal(R.at([2,3],2),1);assert.equal(R.at([2,3],5),1);});
// ── tomas retroactivas y comping ──
test('a pass with one tap per pose change plus the end becomes a take, with no record button',()=>{
  // 3 poses -> 4 golpes; a 24 fps, 250 ms = 6 F
  const r=R.passes([0,250,500,1000],3,24);assert.deepEqual(r.takes,[[6,6,12]]);assert.equal(r.pending,0);assert.equal(r.cut,0);});
test('consecutive passes each become their own take',()=>{
  const r=R.passes([0,250,500,1000, 5000,5125,5500,6000],3,24);assert.deepEqual(r.takes,[[6,6,12],[3,9,12]]);});
test('a long pause cuts an incomplete pass and it is counted, not turned into a bad take',()=>{
  const r=R.passes([0,250, 4000,4250,4500,5000],3,24);assert.deepEqual(r.takes,[[6,6,12]]);assert.equal(r.cut,1);});
test('an unfinished pass is reported as pending',()=>{
  const r=R.passes([0,250],3,24);assert.deepEqual(r.takes,[]);assert.equal(r.pending,2);assert.equal(r.need,4);});
test('taps faster than a frame still give at least one frame per pose',()=>{
  const r=R.passes([0,5,10,15],3,24);assert.deepEqual(r.takes,[[1,1,1]]);});
test('comping takes each pose from the chosen take and keeps the rest',()=>{
  const takes=[[6,6,12],[3,9,12]];assert.deepEqual(R.comp(takes,[1,0,null],[4,4,4]),[3,6,4]);});
test('comping with a missing take index never invents a duration',()=>{
  assert.deepEqual(R.comp([[6,6,12]],[5,null,0],[4,4,4]),[4,4,12]);});
test('a comped rhythm applies like any other: one Undo',()=>{const d=fixture(),s=R.capture(d);
  const takes=R.passes([0,125,250,375],3,24).takes;const v=R.comp(takes,[0,0,0],s.original);
  assert(R.apply(d,s,v));assert.equal(d.history.undoStack.length,1);d.history.undo();assert.deepEqual(R.capture(d).original,[2,1,3]);});
console.log('RHYTHM '+count+' suites OK');
