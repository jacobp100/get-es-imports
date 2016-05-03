const baseObject = { a: 1 };
const test: () => Promise<Object> = async () => ({ ...baseObject, b: 2 });

export { test };
