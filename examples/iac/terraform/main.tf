# Fixture: orders API (Terraform). Resources are illustrative.
resource "aws_vpc" "main" { cidr_block = "10.0.0.0/16" }
resource "aws_subnet" "private_a" { vpc_id = aws_vpc.main.id }
resource "aws_db_subnet_group" "db" { subnet_ids = [aws_subnet.private_a.id] }

resource "aws_cloudfront_distribution" "web" {
  origin { domain_name = aws_s3_bucket.site.bucket_regional_domain_name }
  origin { domain_name = aws_apigatewayv2_api.orders.api_endpoint }
}
resource "aws_s3_bucket" "site" { bucket = "orders-site" }
resource "aws_apigatewayv2_api" "orders" { name = "orders" protocol_type = "HTTP" }
resource "aws_apigatewayv2_integration" "orders" {
  api_id          = aws_apigatewayv2_api.orders.id
  integration_uri = aws_lambda_function.orders.invoke_arn
}
resource "aws_lambda_permission" "apigw" {
  function_name = aws_lambda_function.orders.function_name
  source_arn    = "${aws_apigatewayv2_api.orders.execution_arn}/*"
}
resource "aws_lambda_function" "orders" {
  function_name = "orders"
  role          = aws_iam_role.lambda.arn
  vpc_config { subnet_ids = [aws_subnet.private_a.id] }
  environment { variables = { TABLE = aws_dynamodb_table.orders.name, TOPIC = aws_sns_topic.events.arn, DB = aws_db_instance.reports.address } }
}
resource "aws_iam_role" "lambda" { name = "orders-lambda" }
resource "aws_dynamodb_table" "orders" { name = "orders" }
resource "aws_db_instance" "reports" { db_subnet_group_name = aws_db_subnet_group.db.name }
resource "aws_sns_topic" "events" { name = "order-events" }
resource "aws_sqs_queue" "fulfilment" { name = "fulfilment" }
resource "aws_sns_topic_subscription" "fulfilment" {
  topic_arn = aws_sns_topic.events.arn
  endpoint  = aws_sqs_queue.fulfilment.arn
  protocol  = "sqs"
}
resource "aws_lambda_function" "worker" { function_name = "worker" }
resource "aws_lambda_event_source_mapping" "worker" {
  event_source_arn = aws_sqs_queue.fulfilment.arn
  function_name    = aws_lambda_function.worker.arn
}
resource "aws_s3_bucket" "receipts" { bucket = "orders-receipts" }
resource "aws_cloudwatch_log_group" "orders" { name = "/aws/lambda/orders" }
