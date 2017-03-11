module "prod" {
    source = "../serverless"
    env = "prod"
    read_capacity = 1
    write_capacity = 1
}
