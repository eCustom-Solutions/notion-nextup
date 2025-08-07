import { runNotionPipeline, PipelineOptions } from '../notion-pipeline';
import { ENABLE_DATABASE_UPDATES } from '../config';

export async function invokePipeline(userId: string, userName: string, extra?: Partial<PipelineOptions>): Promise<void> {
  const options: PipelineOptions = {
    enableLogging: true,
    enableDatabaseUpdates: ENABLE_DATABASE_UPDATES,
    ...extra,
  };
  return runNotionPipeline(userId, userName, options);
}
