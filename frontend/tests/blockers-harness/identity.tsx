import { createContext, useContext, useState, type ReactNode } from 'react';
import { API_BASE_URL } from '../../src/api';
const Context=createContext({identity:{apiBaseUrl:API_BASE_URL,storeId:'1'},loading:false,error:'',retry:()=>{}});
export const useStoreIdentity=()=>useContext(Context);
export function IdentityHarness({children}:{children:ReactNode}){
  const [identity,setIdentity]=useState({apiBaseUrl:API_BASE_URL,storeId:'1'});
  (window as any).qaSetStore=(id:string)=>setIdentity({...identity,storeId:id});
  return <Context.Provider value={{identity,loading:false,error:'',retry:()=>{}}}>{children}</Context.Provider>;
}
