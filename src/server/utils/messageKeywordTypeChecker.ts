import { KeywordType } from "@prisma/client";

export function messageKeywordTypeChecker(
  messageIn: string,
  compareWith: string,
  type: KeywordType
) {
  if (type == "Any") {
    return true;
  }

  if (type == "Equal") {
    return messageIn.toLowerCase() == compareWith.toLowerCase();
  }

  if (type == "Contain") {
    return messageIn.toLowerCase().includes(compareWith.toLowerCase());
  }

  return false;
}
