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
    return compareWith.split("|").map(k => k.trim()).filter(Boolean).some(k => messageIn.toLowerCase() === k.toLowerCase());
  }

  if (type == "Contain") {
    return compareWith.split("|").map(k => k.trim()).filter(Boolean).some(k => messageIn.toLowerCase().includes(k.toLowerCase()));
  }

  return false;
}
