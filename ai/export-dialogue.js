import {readFile,writeFile} from 'node:fs/promises';
import {parseHumanEvents,humanDialogueRecords} from '../lib/human-speech.js';
const [input='.data/training/events.jsonl',output='/tmp/opencode/dialogue-training.jsonl']=process.argv.slice(2);
const events=parseHumanEvents(await readFile(input,'utf8'));
// Every channel's human target is preserved verbatim. Historical messages have
// no reliable speaker provenance in legacy records, so are not training inputs.
const records=humanDialogueRecords(events);
await writeFile(output,records.map(r=>JSON.stringify(r)).join('\n')+'\n',{mode:0o600});console.log(JSON.stringify({examples:records.length,output,fineTuningSubmitted:false}));
