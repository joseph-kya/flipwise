import { createContext, useContext } from "react";
import { subjects } from "./demoSubjects";
export const ContentContext = createContext(subjects);
export const useSubjects = () => useContext(ContentContext);
