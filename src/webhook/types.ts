export interface WebhookAssignee {
  id?: string;
  name?: string;
}

export interface WebhookPayload {
  data?: {
    properties?: {
      Assignee?: {
        people?: Array<WebhookAssignee>;
      };
      Name?: {
        title?: Array<{ plain_text?: string }>;
      };
    };
  };
}
