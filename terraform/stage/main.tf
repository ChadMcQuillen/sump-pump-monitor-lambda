module "serverless" {
    source = "../serverless"
    env = "stage"
    read_capacity = 2
    write_capacity = 2
}
