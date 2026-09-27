import {useState} from 'react';
import {useAdmin} from '../context/AdminContext';
import type {AdminConfig} from '../types';
export function useAdminForm<K extends keyof AdminConfig>(key:K) {
 const {config,setConfig}=useAdmin();const [form,setForm]=useState<AdminConfig[K]>(()=>structuredClone(config[key]));const [saved,setSaved]=useState(false);
 return {form,setForm:(next:AdminConfig[K])=>{setForm(next);setSaved(false);},saved,save:()=>setSaved(setConfig({...config,[key]:form}))};
}
