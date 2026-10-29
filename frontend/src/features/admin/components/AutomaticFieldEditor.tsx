import { useEffect, useId, useRef, useState } from 'react';
import './automatic-fields.css';

export interface AutomaticField { key:string; label:string; description:string; example:string }
const marker = /\{\{\s*(\w+)\s*\}\}/g;
export function splitFields(value:string, fields:AutomaticField[]) {
  const parts:{text:string;field?:AutomaticField}[]=[];let last=0;
  for(const match of value.matchAll(marker)) {
    const field=fields.find(item=>item.key===match[1]);if(!field)continue;
    if(match.index!>last)parts.push({text:value.slice(last,match.index)});
    parts.push({text:match[0],field});last=match.index!+match[0].length;
  }
  if(last<value.length)parts.push({text:value.slice(last)});
  return parts;
}
export function previewFields(value:string,fields:AutomaticField[]) {
  return value.replace(marker,(original,key:string)=>fields.find(field=>field.key===key)?.example??original);
}
export function validateAutomaticFields(values:string[],fields:AutomaticField[],required:string[]=[]) {
  const text=values.join('\n');const keys=[...text.matchAll(marker)].map(match=>match[1]);
  const unknown=keys.find(key=>!fields.some(field=>field.key===key));
  if(unknown)return `El campo automático {{${unknown}}} no existe. Selecciona un campo válido.`;
  const remainder=text.replace(marker,'');
  const damaged=fields.find(field=>new RegExp(`\\{\\{?\\s*${field.key}\\b|\\b${field.key}\\s*\\}\\}?`).test(remainder));
  if(damaged)return `El campo automático ${damaged.label} está incompleto. Insértalo desde Campos automáticos.`;
  const missing=required.find(key=>!keys.includes(key));
  return missing?`Incluye el campo automático ${fields.find(field=>field.key===missing)?.label??missing} antes de guardar este correo activo.`:'';
}

function serialize(node:Node):string {
  if(node.nodeType===3)return node.textContent??'';
  if(node instanceof HTMLElement) {
    if(node.dataset.automaticField)return node.dataset.marker??'';
    if(node.tagName==='BR')return '\n';
    const text=Array.from(node.childNodes).map(serialize).join('');
    return (node.tagName==='DIV'||node.tagName==='P')?'\n'+text:text;
  }
  return '';
}

export function AutomaticFieldEditor({label,value,onChange,fields,required=[],disabled=false,multiline=false,maxLength=5000}:{label:string;value:string;onChange:(value:string)=>void;fields:AutomaticField[];required?:string[];disabled?:boolean;multiline?:boolean;maxLength?:number}) {
  const id=useId(),root=useRef<HTMLDivElement>(null),range=useRef<Range|null>(null),last=useRef<string>(),schema=useRef('');
  const [picker,setPicker]=useState(false),[notice,setNotice]=useState('');
  function paint(text:string) {
    const el=root.current;if(!el)return;
    el.replaceChildren(...splitFields(text,fields).map(part=>{
      if(!part.field)return document.createTextNode(part.text);
      const chip=document.createElement('span');chip.contentEditable='false';chip.dataset.automaticField=part.field.key;chip.dataset.marker=part.text;chip.className='automatic-field-chip';chip.textContent=part.field.label;chip.title=part.field.description+(required.includes(part.field.key)?' · Campo obligatorio':'');return chip;
    }));
    last.current=text;
  }
  useEffect(()=>{const signature=fields.map(field=>field.key).join(',')+'|'+required.join(',');if(value!==last.current||schema.current!==signature){paint(value);schema.current=signature;}},[value,fields,required]);
  function remember(){const selection=window.getSelection();if(selection?.rangeCount&&root.current?.contains(selection.anchorNode))range.current=selection.getRangeAt(0).cloneRange();}
  function changed(){const el=root.current;if(!el)return;const text=Array.from(el.childNodes).map((node,index)=>{const content=serialize(node);return index===0&&node instanceof HTMLElement&&['DIV','P'].includes(node.tagName)?content.slice(1):content;}).join('');last.current=text;onChange(text);}
  function includesRequired(selection:Range) {return Array.from(root.current?.querySelectorAll<HTMLElement>('[data-automatic-field]')??[]).some(chip=>required.includes(chip.dataset.automaticField!)&&selection.intersectsNode(chip));}
  function insert(text:string){const el=root.current;if(!el)return;el.focus();const selection=window.getSelection();const saved=range.current;
    const selected=saved&&el.contains(saved.commonAncestorContainer)?saved:document.createRange();if(selected!==saved){selected.selectNodeContents(el);selected.collapse(false);}
    if(!selected.collapsed&&includesRequired(selected)){setNotice('El número de pedido es un campo obligatorio. Puedes editar el texto que lo rodea.');return;}
    selected.deleteContents();const fragment=document.createDocumentFragment();for(const part of splitFields(text,fields)){if(part.field){const span=document.createElement('span');span.contentEditable='false';span.dataset.automaticField=part.field.key;span.dataset.marker=part.text;span.className='automatic-field-chip';span.textContent=part.field.label;span.title=part.field.description;fragment.append(span);}else fragment.append(document.createTextNode(part.text));}
    const end=document.createTextNode('');fragment.append(end);selected.insertNode(fragment);selected.setStartAfter(end);selected.collapse(true);selection?.removeAllRanges();selection?.addRange(selected);remember();changed();}
  return <div className="automatic-field-control"><label id={id}>{label}</label><div ref={root} role="textbox" aria-labelledby={id} aria-multiline={multiline} aria-disabled={disabled} contentEditable={!disabled} suppressContentEditableWarning className={'automatic-field-editor '+(multiline?'is-multiline':'')} onMouseUp={remember} onKeyUp={remember} onBlur={remember} onInput={changed}
    onBeforeInput={event=>{const input=event.nativeEvent as InputEvent;const inputType=input.inputType??'';const selection=window.getSelection();if(inputType==='insertParagraph'&&!multiline){event.preventDefault();return;}if(!selection?.rangeCount)return;const selected=selection.getRangeAt(0);const targets=input.getTargetRanges?.();let affected=selected;
      if(targets?.length){affected=document.createRange();affected.setStart(targets[0].startContainer,targets[0].startOffset);affected.setEnd(targets[0].endContainer,targets[0].endOffset);}
      if(!affected.collapsed&&includesRequired(affected)){event.preventDefault();setNotice('El número de pedido es obligatorio. Edita el texto que lo rodea.');}
      else if(inputType.startsWith('insert')&&value.length+(input.data?.length??0)>maxLength){event.preventDefault();setNotice(`Este campo admite hasta ${maxLength} caracteres.`);}}}
    onKeyDown={event=>{if(!['Backspace','Delete'].includes(event.key))return;const selection=window.getSelection();if(!selection?.rangeCount)return;const selected=selection.getRangeAt(0);let blocked=!selected.collapsed&&includesRequired(selected);
      if(selected.collapsed){const node=selected.startContainer,offset=selected.startOffset,back=event.key==='Backspace';let adjacent:Node|null=null;
        if(node.nodeType===3&&(back?offset===0:offset===(node.textContent??'').length))adjacent=back?node.previousSibling:node.nextSibling;
        else if(node.nodeType===1)adjacent=node.childNodes[back?offset-1:offset]??null;
        while(adjacent?.nodeType===3&&!adjacent.textContent)adjacent=back?adjacent.previousSibling:adjacent.nextSibling;
        if(adjacent instanceof HTMLElement&&required.includes(adjacent.dataset.automaticField??''))blocked=true;
      }
      if(blocked){event.preventDefault();setNotice('El número de pedido es obligatorio. Edita el texto que lo rodea.');}}}
    onPaste={event=>{event.preventDefault();remember();insert(event.clipboardData.getData('text/plain').slice(0,Math.max(0,maxLength-value.length)));}}
    onDrop={event=>event.preventDefault()}
    onCut={event=>{const selection=window.getSelection();if(selection?.rangeCount&&includesRequired(selection.getRangeAt(0))){event.preventDefault();setNotice('El número de pedido es un campo obligatorio.');}}}/>
    <button type="button" className="automatic-field-insert" disabled={disabled} aria-expanded={picker} onMouseDown={remember} onClick={()=>setPicker(!picker)}>＋ Insertar campo automático</button>
    {picker&&<div className="automatic-field-picker" role="group" aria-label={`Campos para ${label}`}>{fields.map(field=><button type="button" key={field.key} onClick={()=>{insert(`{{${field.key}}}`);setPicker(false);}}><strong>{field.label}</strong><small>{field.description}</small></button>)}</div>}
    {notice&&<p role="status">{notice}</p>}
  </div>;
}
