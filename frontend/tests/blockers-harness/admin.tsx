import { createContext, useContext, type ReactNode } from 'react';
import { createDefaultLegalPages } from '../../src/features/admin/data/mockAdminData';
const config={template:'editorial',legalPages:createDefaultLegalPages()};
const Context=createContext({config,setConfig:()=>true});
export const useAdmin=()=>useContext(Context);
export function AdminHarness({children}:{children:ReactNode}){return <Context.Provider value={{config,setConfig:()=>true}}>{children}</Context.Provider>;}
