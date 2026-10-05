import {
    Flex,
    IconButton,
    Input,
    InputGroup,
    InputRightElement, useColorModeValue
} from "@chakra-ui/react";

import { FaPaperPlane} from "react-icons/fa";

interface IProps {
    inputValue:string
    setInputValue: React.Dispatch<React.SetStateAction<string>>
    handleSend:()=>void
}

const InputContainer=({inputValue,setInputValue,handleSend}:IProps)=>{

    const bgColor = useColorModeValue("white", "gray.800");
    const borderColor = useColorModeValue("gray.200", "gray.600");

    return(
        <>
            <Flex
                p={4}
                borderTop="1px solid"
                borderColor={borderColor}
                bg={bgColor}
            >
                <InputGroup>
                    <Input
                        placeholder="Type your message..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        borderRadius="full"
                        boxShadow="sm"
                        pr="4rem"
                        _focus={{
                            boxShadow: "0 0 0 2px rgba(66, 153, 225, 0.6)",
                            borderColor: "blue.300"
                        }}
                    />
                    <InputRightElement width="3.5rem">
                        <IconButton
                            icon={<FaPaperPlane/>}
                            colorScheme="blue"
                            aria-label="Send"
                            onClick={handleSend}
                            borderRadius="full"
                            size="sm"
                            isDisabled={!inputValue.trim()}
                            _disabled={{
                                opacity: 0.5,
                                cursor: "not-allowed"
                            }}
                            _hover={{
                                transform: 'scale(1.1)'
                            }}
                            transition="all 0.2s ease"
                        />
                    </InputRightElement>
                </InputGroup>
            </Flex>
        </>
    )
}

export default InputContainer;