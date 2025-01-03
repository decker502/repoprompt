// 设置测试环境
process.env.NODE_ENV = 'test';

// 增加测试超时时间
jest.setTimeout(30000);

// 在每个测试后清理
afterEach(async () => {
    // 等待所有微任务完成
    await new Promise(resolve => setImmediate(resolve));
});

// 在所有测试后清理
afterAll(async () => {
    // 等待所有微任务完成
    await new Promise(resolve => setImmediate(resolve));
}); 