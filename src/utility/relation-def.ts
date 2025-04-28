export interface RelationDef {
  name: string;
  inner?: boolean;
  extraCondition?: string;
  extraConditionFields?: Record<string, any>;
  noSelect?: boolean;
}
