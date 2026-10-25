import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {defaultNameplate,validateNameplate,readNameplate} from '../server/nameplates.js';
test('nameplate preferences reject unsupported styles and long titles',()=>{
 assert.deepEqual(validateNameplate({...defaultNameplate,title:'  daydreamer  '}),{...defaultNameplate,title:'daydreamer'});
 for(const change of [{palette:'url(x)'},{frame:'unknown'},{charm:'crew'},{title:'x'.repeat(29)},{title:'a\nb'}])assert.equal(validateNameplate({...defaultNameplate,...change}),null);
 assert.deepEqual(readNameplate('bad json'),defaultNameplate);
});
test('live nameplate updates preserve member state and target one account',()=>{
 const source=readFileSync(new URL('../server/chat/lounge.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export class LoungeRoom','class LoungeRoom')+'\nLoungeRoom;';
 const Room=vm.runInNewContext(source,{DurableObject:class{constructor(ctx){this.ctx=ctx;}},validateNameplate,defaultNameplate,WebSocketRequestResponsePair:class{},setTimeout,clearTimeout});
 const socket=id=>({value:{id,x:30,y:50,facing:'left'},deserializeAttachment(){return this.value;},serializeAttachment(value){this.value=value;}});
 const a=socket('a'),b=socket('b'),ctx={getWebSockets:()=>[a,b],setWebSocketAutoResponse(){}};
 const room=new Room(ctx,{});let scheduled=0;room.schedule=()=>scheduled++;
 const plate={...defaultNameplate,palette:'mint'};room.setNameplate('a',plate);
 assert.deepEqual(a.value.nameplate,plate);assert.equal(a.value.x,30);assert.equal(b.value.nameplate,undefined);assert.equal(scheduled,1);
 room.setNameplate('a',{...plate,charm:'invalid'});assert.equal(scheduled,1);
});
