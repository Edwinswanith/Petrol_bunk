import {
  createMemoryOperationsRepository,
} from "@/server/repositories/memory-operations-repository";
import { hasMongoConfiguration } from "@/server/db/mongo-client";
import { createMongoOperationsRepository } from "@/server/repositories/mongo-operations-repository";
import type { OperationsRepository } from "@/server/repositories/operations-repository";

declare global {
  var forecourtOperationsRepository: OperationsRepository | undefined;
}

export function getOperationsRepository(): OperationsRepository {
  if (!globalThis.forecourtOperationsRepository) {
    globalThis.forecourtOperationsRepository = hasMongoConfiguration()
      ? createMongoOperationsRepository()
      : createMemoryOperationsRepository({ seedDemoData: true });
  }
  return globalThis.forecourtOperationsRepository;
}
