const AppTester = require('../../utils/app-tester.js');
const DB = require('../../../bundles/UserspaceBundle/service/db/MongodbService.js');

let appTester;
let request;

beforeAll(() => {
    
    appTester = new AppTester({useMockAuthentificaiton: false});
    request = appTester.getRequestSender();
    
    test('Email test options pass to global object', (done) => {
        expect(global.userspaceMailOptions).toBeTruthy();
        done();
    });

    test('Acces to sign up form', (done) => {
        request.get('/register').then((response) => {
            expect(response.statusCode).toBe(200);
            done();
        });
    });
});


describe('Prevent user registration when wrong inputs', () => {

    test('Prevent user registration when conditions not accepted', (done) => {
        request.post('/register').send({
            username: "username", 
            email: "test@test.com", 
            password: "password", 
            confirm_password: "password",
            first_name: "firstname",
            last_name: "lastname",
            conditions: false
        })
        .then((response) => {
            expect(response.header.location.includes("register")).toBeTruthy();
            expect(response.statusCode).toBe(302);
            args = appTester.getQueryArguments(response.header.location);
            expect(args.username).toBe("username");
            expect(args.email).toBe("test@test.com");
            expect(args.firstName).toBe("firstname");
            expect(args.lastName).toBe("lastname");
            done();
        });
    });

    test('Prevent user registration when bad email', (done) => {
        request.post('/register').send({
            username: "username", 
            email: "test@test", 
            password: "password", 
            confirm_password: "password",
            first_name: "firstname",
            last_name: "lastname",
            conditions: false
        })
        .then((response) => {
            expect(response.header.location.includes("register")).toBeTruthy();
            expect(response.statusCode).toBe(302);
            args = appTester.getQueryArguments(response.header.location);
            expect(args.username).toBe("username");
            expect(args.email).toBe("test@test");
            expect(args.firstName).toBe("firstname");
            expect(args.lastName).toBe("lastname");
            done();
        });
    });

    test('Prevent user registration when different passwords', (done) => {
        request.post('/register').send({
            username: "username", 
            email: "test@test", 
            password: "password", 
            confirm_password: "passworddiff",
            first_name: "firstname",
            last_name: "lastname",
            conditions: false
        })
        .then((response) => {
            expect(response.header.location.includes("register")).toBeTruthy();
            expect(response.statusCode).toBe(302);
            args = appTester.getQueryArguments(response.header.location);
            expect(args.username).toBe("username");
            expect(args.email).toBe("test@test");
            expect(args.firstName).toBe("firstname");
            expect(args.lastName).toBe("lastname");
            done();
        });
    });
});

describe('User Registration', () => {
    test('Register user with correct entries and prevent other registration with same emmail or username', (done) => {
        request.post('/register').send({
            username: "username", 
            email: "test@test.com", 
            password: "password", 
            confirm_password: "password",
            first_name: "firstname",
            last_name: "lastname",
            conditions: true
        })
        .then((response) => {
            expect(response.header.location).toBe("/login");
            expect(response.statusCode).toBe(302);
            //Test prevent user registration with same email
            return request.post('/register').send({
                username: "username2", 
                email: "test@test.com", 
                password: "password2", 
                confirm_password: "password2",
                first_name: "firstname2",
                last_name: "lastname2",
                conditions: true
            });
        })
        .then((response) => {
            expect(response.header.location.includes("register")).toBeTruthy();
            expect(response.statusCode).toBe(302);
            args = appTester.getQueryArguments(response.header.location);
            expect(args.username).toBe("username2");
            expect(args.email).toBe("test@test.com");
            expect(args.firstName).toBe("firstname2");
            expect(args.lastName).toBe("lastname2");
            //Test prevent user registration with same username
            return request.post('/register').send({
                username: "username", 
                email: "test2@test.com", 
                password: "password2", 
                confirm_password: "password2",
                first_name: "firstname2",
                last_name: "lastname2",
                conditions: true
            });
        })
        .then((response) => {
            expect(response.header.location.includes("register")).toBeTruthy();
            expect(response.statusCode).toBe(302);
            args = appTester.getQueryArguments(response.header.location);
            expect(args.username).toBe("username");
            expect(args.email).toBe("test2@test.com");
            expect(args.firstName).toBe("firstname2");
            expect(args.lastName).toBe("lastname2");
            done();
        });
    }, 10000);
});

afterAll((done) =>{
    var db = new DB({});
    var COLLECTION = 'users';
    db.connect((err) => {
        if (err) {
            done(err);
        }
        db.loadCollection(COLLECTION, (err) => {
            if (err) {
                done(err);
            }
            db.dropCollection(COLLECTION, (err) => {
                if (err) {
                    done(err);
                }
                db.disconnect(() => {
                    done();
                });
            });
        });
    });  
});

