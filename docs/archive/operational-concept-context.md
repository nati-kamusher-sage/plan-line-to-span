# Archived Operational Concept Context

> **Status: Archived and non-normative.** This file preserves original source material, including superseded and contradictory examples. The governing behavioral document is the [Operational Concept](../operational-concept.md).

this demo is used to demonstrate the plan line to span utility.
the purpose of the utility is to support the planning of benefits for employees based on their dimensions.
the employees are lines in a plan grid.
each employee line has a set of dimensions and their values. for example, an employee line can have the following dimensions and values:
```json
{
  "dimensions": {
    "location": "USA",
    "department": "R&D"
  }
}
```
the benefits of an employee are also lines in the same xpna budget grid. the employee line is a summary line of the employee's benefits.
example grid table is as follows:

|------------|---------------|------------|----------|----------|--------------|
|Employee    | Location      | Department | Jan 2024 | Feb 2024 | March 2024   |
|------------|---------------|------------|----------|----------|--------------|
| John       | New York City | R&D        | 1000     | 1000     | 1000         |
|  benefit 1 | USA           | N/A        | 500      | 500      | 500          |
|  benefit 2 | N/A           | R&D        | 500      | 500      | 500          |
|------------|---------------|------------|----------|----------|--------------|
| Jane       | Los Angeles   | R&D        | 1000     | 1000     | 1000         |
|  benefit 1 | USA           | N/A        | 500      | 500      | 500          |
|  benefit 3 | Los Angeles   | N/A        | 500      | 500      | 500          |
|------------|---------------|------------|----------|----------|--------------|

A benefit can be associated with multiple employees.
An employee can have multiple benefits.

The assosciation between a benefit and an employee is based on the dimensions of the employee and the dimensions of the benefit.
A benefit can be created, updated, deleted  and queried based on the dimensions of the benefit.
The dimensions of a benefit are often named as a span.
An employee is associated with a benefit in the following cases:
- the benefit's span is a subset of the employee dimensions. for example, if the benefit's span is {location: USA} and the employee's dimensions are {location: USA, department: R&D}, then the employee is associated with the benefit.
- In case of hierarchical dimensions, if the benefit's span dimension is a parent of the employee's dimension, then this dimension is considered a match. for example, if the benefit's span is {location: USA} and the employee's dimensions are {location: New York City, department: R&D}, then the employee is associated with the benefit because New York City is a child of USA.

Our service is designed to receive an employee's dimensions and return all the benefits that are associated with the employee based on the above rules.

In order to support the above functionality, we need to be able to create, update, delete and query benefits based on their dimensions, in an efficient manner.

The api of the service include the following benefit operations:
- create a benefit - the app will receive a benefit's span and formula and store it in the R*-tree.
- update a benefit - the app will receive a benefit's span and formula and update the existing benefit in the R*-tree.
- delete a benefit - the app will receive a benefit's span and delete the existing benefit in the R*-tree.
- query a benefit - the app will receive a span and return the benefit's formula if the span exists in the R*-tree.
- query benefits for an employee - the app will receive an employee's dimensions and return all the benefits that are associated with the employee based on the above rules.

the api of the service will include creating the R*-tree. The R*-tree will be created based on the dimensions that are defined in a dimension file. 
The dimension file will define the dimension types (e.g. Location, Department), the dimension values (E.g. USA, New York), and the hierarchy of the dimensions values (e.g. New york: {parent: USA}).
for example file structure is as follows:
```json
{
  "format": "plan-line-to-span-dimensions/v1",
  "dimensions": [
    {
      "id": "location",
      "name": "Location",
      "values": [
        { "key": "4", "name": "USA" },
        { "key": "20", "name": "New York City", "parentKey": "4" },
        { "key": "21", "name": "Los Angeles", "parentKey": "4" }
      ]
    },
    {
      "id": "department",
      "name": "Department",
      "values": [{ "key": "rnd", "name": "R&D" }]
    }
  ]
}
```


so a benefit is made up of a span (a set of dimensions and their values) and a formula (an opaque object that is associated with the span).
when updating a benefit, both the span and the formula can be updated.

example of a benefit is as follows:
```json
{
  "span": {
    "dimensions": {
      "location": "USA",
      "department": "R&D"
    }
  },
  "formula": {
    "some": "data"
  }
}
```

the application can receive a plan line and return the matching spans and their formulas.
a plan line is a set of dimensions and their values. a span is a set of dimensions and their values, and a formula for our purpse is an opaque object that is associated with a span.

a plan line example is 
```json
{
  "dimensions": {
    "location": "IL",
    "product": "Widget"
  }
}
```

a span example is 
```json
{
  "dimensions": {
    "location": "IL",
    "product": "Widget"
  },
  "formula": {
    "some": "data"
  }
}
```

in our app we index spans in an R*-tree, and the plan line is used to query the R*-tree for matching spans.
the dimensions in the tree may have a hierarchy. 
an example of a hierarchical dimension is location, where IL is a child of USA.
here is an example of a hierarchical dimension file:
```json
{
  "format": "plan-line-to-span-dimensions/v1",
  "dimensions": [
    {
      "id": "location",
      "name": "Location",
      "values": [
        { "key": "4", "name": "USA" },
        { "key": "20", "name": "New York City", "parentKey": "4" },
        { "key": "21", "name": "Los Angeles", "parentKey": "4" }
      ]
    },
    {
      "id": "department",
      "name": "Department",
      "values": [{ "key": "rnd", "name": "R&D" }]
    }
  ]
}
```


In the init mode the user can load a dimension file and the app creates the axes for the R*-tree. 
after the axes are created, the user can send events to the app such as add, change, delete, and get. the add event adds a span and its formula to the R*-tree, the change event changes a span and its formula in the R*-tree, the delete event deletes a span and its formula from the R*-tree, and the get event returns all matching spans and their formulas for a given plan line.
if the event is a get event, the app will return all matching spans and their formulas for the given plan line. 
if the event is a change event, the app will change all the matching spans formulas to the new formula.

An example use case: This app is supposed to support the allocation of benefits to employees based on their dimensions.
When we create a benefit, we create a span and associate a formula with it. Then we store the span and formula in the R*-tree. 

in the query benefit, we query the R*-tree for all matching spans and their formulas. Then we can apply the formulas to the plan line to determine the benefits for that employee.
for exanple we can create the following benefits and store them in the R*-tree as Span and formula associations:
Benefit 1: for all employees in USA
Benefit 2: for all employees in USA and in the R&D departement
Benefit 3: for all employees in New York City

now lets create scenarios around these benefits and see how the app will return the matching spans and their formulas for a given plan line.

- Query Benefit, with benefit's span as payload: { "span": { "location": "USA" } } - return Benefits 1, as it matches the benefit's span
- UPDATE Benefit, with benefit's span and formula as payload: { "span": { "location": "USA" }, "formula": {} } - change the formula for Benefit 1, as it matches the benefit's span

- DELETE Benefit, with benefit's span as payload: { "span": { "location": "USA" } } - delete Benefit 1 because it matches the benefit's span.
- CREATE Benefit, with benefit's span and formula as payload: { "span": { "location": "USA", "department": "Engineering" }, "formula": {} } - create a new Benefit 4 with the given span and formula.
- Query Employee, with benefit's span as payload: { "location": "USA" } - returns Benefits 1, 2, 3, 4 as they all match the benefit's span.
