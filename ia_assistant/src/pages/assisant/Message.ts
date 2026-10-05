import type { NavigationResult } from "../../services/IAserviceApi";

export type Message = {
    id:         number;
    from:       "user" | "bot";
    text:       string;
    isTyping:   boolean;
    isThinking: boolean;
    navigation?: NavigationResult | null;  
};
